import dayjs from 'dayjs'
import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$User} from '../tables/User'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import hash from '../utils/hash'
import mail from '../utils/mail'
import gatekeeper from '../utils/gatekeeper'
import {random} from '../utils/random'
import {$Session} from '../tables/Session'
import {getGoogleAccessToken, getGoogleUserInfo} from '../utils/google'
import {requireUser} from './requireUser'
import {TUser} from '../schemas/User'
import {TTeam} from '../schemas/Team'
import {$Member} from '../tables/Member'
import {$Team} from '../tables/Team'
import {TSession} from '../schemas/Session'
/**
 *
 */
export default new Map<string, RequestHandler>([
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
      const user = await $User.maybeOne({
        email: regex.normalize(body.email),
      })
      if (!user)
        throw new Error(`User with email ${body.email} does not exist.`)
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
      password: io.string(),
      termsAccepted: io.boolean(),
      userAgent: io.optional(io.string()),
    }),
    handler: (body) => async () => {
      if (body.password.length < 5)
        throw new Error('Password must be at least 5 characters long.')
      if (!body.termsAccepted)
        throw new Error('Please accept our terms to create an account.')
      const countUserMatchingEmail = await $User.count({
        email: regex.normalize(body.email),
      })
      if (countUserMatchingEmail)
        throw new Error(`User already exists with email "${body.email}".`)
      // const code = await _sendUserVerificationEmail(body.email, body.firstName)
      const user = await $User.createOne({
        ...body,
        password: await hash.encrypt(body.password),
        emailVerified: false,
        emailCode: random.generateId(), // code,
        emailCodeCreatedOn: new Date().toISOString(),
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
      const code = await _sendResetPasswordEmail(user.email, user.firstName)
      await $User.updateOne(
        {id: user.id},
        {
          emailCode: code,
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
      let user = await $User.maybeOne({
        email: regex.normalize(body.email),
      })
      if (!user)
        throw new Error(`User with email ${body.email} does not exist.`)
      if (user.emailCode !== body.code.split('-').join('').split(' ').join(''))
        throw new Error(`Forgot password code is incorrect.`)
      if (_userEmailCodeHasExpired(user.emailCodeCreatedOn)) {
        const code = await _sendResetPasswordEmail(body.email, user.firstName)
        await $User.updateOne(
          {id: user.id},
          {emailCode: code, emailCodeCreatedOn: new Date().toISOString()}
        )
        const message = `Your forgot password code has expired. A new code has been sent to your email.`
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
      const user = await $User.maybeOne({
        email: regex.normalize(body.email),
      })
      if (!user)
        throw new Error(`User with email ${body.email} does not exist.`)
      if (user.emailCode !== body.code.split('-').join('').split(' ').join(''))
        throw new Error(`Verification code is incorrect.`)
      if (_userEmailCodeHasExpired(user.emailCodeCreatedOn)) {
        const code = await _sendUserVerificationEmail(
          body.email,
          user.firstName
        )
        await $User.updateOne(
          {id: user.id},
          {emailCode: code, emailCodeCreatedOn: new Date().toISOString()}
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
const _sendUserVerificationEmail = async (email: string, firstName: string) => {
  const code = random.randomString(8)
  const codeSliced = `${code.slice(0, 4)}-${code.slice(4, 8)}`
  await mail.send({
    to: [email],
    subject: 'Please Verify Your Email',
    html: `
      Hey ${firstName},<br/><br/>
      Your email verification code:<br/><br/>
      <strong>${codeSliced}</strong><br/><br/>
      The code will expire in 10 minutes.
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
const _sendResetPasswordEmail = async (email: string, firstName: string) => {
  const code = random.randomString(8)
  const codeSliced = `${code.slice(0, 4)}-${code.slice(4, 8)}`
  await mail.send({
    to: [email],
    subject: 'Forgot Password',
    html: `
      Hey ${firstName},<br/><br/>
      Your password reset code is:<br/><br/>
      <strong>${codeSliced}</strong><br/><br/>
      The code will expire in 10 minutes.
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
export const _userEmailCodeHasExpired = (
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
  return {
    user,
    session,
    team,
  }
}
