import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import hash from '../utils/hash'
import gatekeeper from '../utils/gatekeeper'
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
import {userEmail} from './userEmail'
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
        const user = await userEmail.maybeUser(email)
        let data: {status: string; email: string; firstName?: string}
        if (!user) {
          data = {status: 'unknown', email}
        } else if (!user.password) {
          data = {status: 'password', email, firstName: user.firstName}
          await userEmail.codeSendSave(user, email, 'Verify Email')
        } else {
          const i = userEmail.get(user, email)
          data = {
            status: !i?.verified ? 'unverified' : 'good',
            firstName: user.firstName,
            email,
          }
        }
        return data
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityLogin',
    payload: io.object({
      email: io.string().email().trim(),
      password: io.string(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({email, password, userAgent}) =>
      async () => {
        const user = await userEmail.maybeUser(email)
        if (!user) throw new Error(`User with email ${email} does not exist.`)
        if (!user.password?.trim().length)
          throw new Error('User does not have a password.')
        if (!(await hash.compare(password, user.password)))
          throw new Error('Password is incorrect.')
        const session = await gatekeeper.createUserSession(user, userAgent)
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
    handler:
      ({code, userAgent}) =>
      async () => {
        const {access_token} = await getGoogleAccessToken(code)
        const userInfo = await getGoogleUserInfo(access_token)
        const user = await userEmail.maybeUser(userInfo.email)
        if (!user) {
          const message = `There are no accounts with the email ${userInfo.email}. Please sign up before logging in with Google.`
          throw new Error(message)
        }
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _createAuthPayload(user, session)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecuritySignUp',
    payload: io.object({
      email: io.string().email().trim(),
      firstName: io.string(),
      lastName: io.string(),
      gender: io.string(),
      termsAccepted: io.boolean(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({userAgent, email, firstName, termsAccepted, ...body}) =>
      async () => {
        if (!termsAccepted)
          throw new Error('Please accept our terms to create an account.')
        if (await userEmail.maybeUser(email))
          throw new Error(`User already exists with email "${email}".`)
        const code = await userEmail.codeSend(email, firstName, 'Verify Email')
        const user = await $User.createOne({
          ...body,
          email,
          firstName,
          termsAccepted,
          emails: [userEmail.create(email, code)],
        })
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _createAuthPayload(user, session)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityForgot',
    payload: io.string().email(),
    handler: (email) => async () => {
      const user = await userEmail.maybeUser(email)
      if (!user) throw new Error(`User with email ${email} does not exist.`)
      await userEmail.codeSendSave(user, email, 'Restore Account')
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityVerify',
    payload: io.object({
      email: io.string().email(),
      code: io.string(),
      newPassword: io.string().emptyok(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({email, code, newPassword, userAgent}) =>
      async () => {
        let user = await userEmail.maybeUser(email)
        if (!user) throw new Error(`User with email ${email} does not exist.`)
        if (!userEmail.isCodeEqual(user, email, code))
          throw new Error(`Code is incorrect.`)
        if (userEmail.isCodeExpired(user, email)) {
          await userEmail.codeSendSave(user, email, 'Verify Email')
          const message = `Your code has expired. A new code has been sent to your email.`
          throw new Error(message)
        }
        if (newPassword.trim().length || !user.password) {
          if (newPassword.length < 5)
            throw new Error('Password must be at least 5 characters long.')
          const password = await hash.encrypt(newPassword)
          user = await $User.updateOne({id: user.id}, {password})
        }
        user = await userEmail.verify(user, email)
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _createAuthPayload(user, session)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityCurrent',
    handler: () => async (req) => {
      let [user, session] = await requireUser(req)
      if (user.email && user.emails?.length === 0)
        user = await userEmail.migrate(user)
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
