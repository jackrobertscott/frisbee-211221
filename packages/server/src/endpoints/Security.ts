import dayjs from 'dayjs'
import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import hash from '../utils/hash'
import mail from '../utils/mail'
import gatekeeper from '../utils/gatekeeper'
import {random} from '../utils/random'
import {$Session} from '../tables/$Session'
import {getGoogleAccessToken, getGoogleUserInfo} from '../utils/google'
import {requireUser} from './requireUser'
import {TUser} from '../schemas/ioUser'
import {TTeam} from '../schemas/ioTeam'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {TSession} from '../schemas/ioSession'
import {TSeason} from '../schemas/ioSeason'
import {$Season} from '../tables/$Season'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/SecurityStatus',
    payload: io.object({
      email: io.string().email().trim(),
    }),
    handler:
      ({email}) =>
      async () => {
        const user = await $User.maybeOne({email: regex.normalize(email)})
        let data: {status: string; email: string; firstName?: string}
        if (!user) {
          data = {status: 'unknown', email}
        } else if (!user.password) {
          data = {status: 'passwordless', email, firstName: user.firstName}
          const emailCode = await _sendUserEmailCode({
            email: user.email,
            firstName: user.firstName,
            subject: 'Verify Email',
          })
          await $User.updateOne(
            {id: user.id},
            {emailCode, emailCodeCreatedOn: new Date().toISOString()}
          )
        } else {
          data = {status: 'good', email: user.email, firstName: user.firstName}
        }
        return data
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityLoginPassword',
    payload: io.object({
      email: io.string().email().trim(),
      password: io.string(),
      userAgent: io.optional(io.string()),
    }),
    handler: (body) => async () => {
      const user = await $User.maybeOne({email: regex.normalize(body.email)})
      if (!user)
        throw new Error(`User with email ${body.email} does not exist.`)
      if (!user.password?.trim().length)
        throw new Error('User does not have a password.')
      if (!(await hash.compare(body.password, user.password)))
        throw new Error('Password is incorrect.')
      const session = await gatekeeper.createUserSession(user, body.userAgent)
      return _createAuthPayload(user, session)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityLoginGoogle',
    payload: io.object({
      code: io.string().trim(),
      userAgent: io.optional(io.string()),
    }),
    handler: (body) => async () => {
      const {access_token} = await getGoogleAccessToken(body.code)
      const userInfo = await getGoogleUserInfo(access_token)
      const user = await $User.maybeOne({
        email: regex.normalize(userInfo.email),
      })
      if (!user) {
        const message = `There are no accounts with the email ${userInfo.email}. Please sign up before logging in with Google.`
        throw new Error(message)
      }
      const session = await gatekeeper.createUserSession(user, body.userAgent)
      return _createAuthPayload(user, session)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecuritySignUpRegular',
    payload: io.object({
      email: io.string().email().trim(),
      firstName: io.string(),
      lastName: io.string(),
      gender: io.enum(['male', 'female']),
      termsAccepted: io.boolean(),
      userAgent: io.optional(io.string()),
    }),
    handler: (body) => async () => {
      if (!body.termsAccepted)
        throw new Error('Please accept our terms to create an account.')
      if (await $User.count({email: regex.normalize(body.email)}))
        throw new Error(`User already exists with email "${body.email}".`)
      const emailCode = await _sendUserEmailCode({
        email: body.email,
        firstName: body.firstName,
        subject: 'Verify Email',
      })
      const user = await $User.createOne({
        ...body,
        emailCode,
        emailCodeCreatedOn: new Date().toISOString(),
        emailVerified: false,
      })
      const session = await gatekeeper.createUserSession(user, body.userAgent)
      return _createAuthPayload(user, session)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityForgotSend',
    payload: io.string().email(),
    handler: (email) => async () => {
      const user = await $User.maybeOne({
        email: regex.normalize(email),
      })
      if (!user) throw new Error(`User with email ${email} does not exist.`)
      const emailCode = await _sendUserEmailCode({
        email: user.email,
        firstName: user.firstName,
        subject: 'Restore Account',
      })
      await $User.updateOne(
        {id: user.id},
        {
          emailCode,
          emailCodeCreatedOn: new Date().toISOString(),
        }
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityForgotVerify',
    payload: io.object({
      email: io.string().email(),
      code: io.string(),
      newPassword: io.string(),
      userAgent: io.optional(io.string()),
    }),
    handler: (body) => async () => {
      let user = await $User.maybeOne({email: regex.normalize(body.email)})
      if (!user)
        throw new Error(`User with email ${body.email} does not exist.`)
      if (user.emailCode !== body.code.split('-').join('').split(' ').join(''))
        throw new Error(`Forgot password code is incorrect.`)
      if (_hasUserEmailCodeExpired(user.emailCodeCreatedOn)) {
        const emailCode = await _sendUserEmailCode({
          email: user.email,
          firstName: user.firstName,
          subject: 'Verify Email',
        })
        await $User.updateOne(
          {id: user.id},
          {emailCode, emailCodeCreatedOn: new Date().toISOString()}
        )
        const message = `Your code has expired. A new code has been sent to your email.`
        throw new Error(message)
      }
      if (body.newPassword.length < 5)
        throw new Error('Password must be at least 5 characters long.')
      user = await $User.updateOne(
        {id: user.id},
        {
          emailVerified: true,
          password: await hash.encrypt(body.newPassword),
        }
      )
      const session = await gatekeeper.createUserSession(user, body.userAgent)
      return _createAuthPayload(user, session)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityVerifyEmail',
    payload: io.object({
      email: io.string().email(),
      code: io.string(),
      userAgent: io.optional(io.string()),
    }),
    handler: (body) => async () => {
      const user = await $User.maybeOne({email: regex.normalize(body.email)})
      if (!user)
        throw new Error(`User with email ${body.email} does not exist.`)
      if (user.emailCode !== body.code.split('-').join('').split(' ').join(''))
        throw new Error(`Verification code is incorrect.`)
      if (_hasUserEmailCodeExpired(user.emailCodeCreatedOn)) {
        const emailCode = await _sendUserEmailCode({
          email: user.email,
          firstName: user.firstName,
          subject: 'Verify Email',
        })
        await $User.updateOne(
          {id: user.id},
          {emailCode, emailCodeCreatedOn: new Date().toISOString()}
        )
        const message = `Your verification code has expired. A new code has been sent to your email.`
        throw new Error(message)
      }
      await $User.updateOne({id: user.id}, {emailVerified: true})
      const session = await gatekeeper.createUserSession(user, body.userAgent)
      return _createAuthPayload(user, session)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityCurrent',
    handler: () => async (req) => {
      const [user, session] = await requireUser(req)
      return _createAuthPayload(user, session)
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityLogout',
    handler: () => async (req) => {
      const auth = await gatekeeper.digestRequest(req)
      const session = await $Session.getOne({id: auth.sessionId})
      await $Session.updateOne(
        {id: session.id},
        {ended: true, endedOn: new Date().toISOString()}
      )
    },
  }),
])
/**
 *
 */
const _sendUserEmailCode = async (data: {
  email: string
  firstName: string
  subject: string
}) => {
  const code = random.randomString(8)
  const codeSliced = `${code.slice(0, 4)}-${code.slice(4, 8)}`
  await mail.send({
    to: [data.email],
    subject: data.subject,
    html: `
      Hey ${data.firstName},<br/><br/>
      Your code is:<br/><br/>
      <strong>${codeSliced}</strong><br/><br/>
      The code will expire in 10 minutes.<br/><br/>
      Have a nice day.
    `
      .split('\n')
      .map((i) => i.trim())
      .join('\n')
      .trim(),
  })
  return code
}
/**
 *
 */
export const _hasUserEmailCodeExpired = (
  createdOn: string,
  length: number = 10,
  type: string = 'minutes'
) => {
  const now = dayjs()
  const expiry = dayjs(createdOn).add(length, type)
  return dayjs(now).isAfter(expiry)
}
/**
 *
 */
export const _createAuthPayload = async (
  user: TUser,
  session: TSession,
  team?: TTeam
) => {
  if (!team) {
    const members = await $Member.getMany({userId: user.id, pending: false})
    let member = members.find((i) => i.id === user.lastMemberId)
    member ??= members[0]
    if (member) {
      team = await $Team.maybeOne({id: member.teamId})
      if (team && user.lastMemberId !== member.id)
        await $User.updateOne({id: user.id}, {lastMemberId: member.id})
    }
  }
  let season: TSeason | undefined
  if (team) {
    season = await $Season.getOne({id: team.seasonId})
  } else {
    const openSeasons = await $Season.getMany({signUpOpen: true})
    if (openSeasons.length === 1) season = openSeasons[0]
  }
  return {
    user,
    session,
    season,
    team,
  }
}
