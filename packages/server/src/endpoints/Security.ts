import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import hash from '../utils/hash'
import gatekeeper from '../utils/gatekeeper'
import {$Session} from '../tables/$Session'
import {getGoogleAccessToken, getGoogleUserInfo} from '../utils/google'
import {TUser} from '../schemas/ioUser'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
import {TSession} from '../schemas/ioSession'
import {$Season} from '../tables/$Season'
import {userEmail} from './userEmail'
import {TSeason} from '../schemas/ioSeason'
import {TTeam} from '../schemas/ioTeam'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/SecurityCurrent',
    payload: io.object({
      seasonId: io.optional(io.string()),
    }),
    handler:
      ({seasonId}) =>
      async (req) => {
        const auth = await gatekeeper.digestRequest(req)
        let [user, session] =
          auth && auth.userId && auth.sessionId
            ? await Promise.all([
                $User.maybeOne({id: auth.userId}),
                $Session.maybeOne({id: auth.sessionId}),
              ])
            : []
        if (user && userEmail.isOld(user)) user = await userEmail.migrate(user)
        let season: TSeason | undefined
        if (seasonId) season = await $Season.maybeOne({id: seasonId})
        if (!season && user?.lastSeasonId)
          season = await $Season.maybeOne({id: user.lastSeasonId})
        season ??= await $Season.maybeOne({}, {sort: {createdOn: -1}})
        if (!season) throw new Error()
        return {
          season,
          auth:
            user && session
              ? await _addTeamOfSeason(user, session, season.id)
              : undefined,
        }
      },
  }),
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
      seasonId: io.optional(io.string()),
      email: io.string().email().trim(),
      password: io.string(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({seasonId, email, password, userAgent}) =>
      async () => {
        const user = await userEmail.maybeUser(email)
        if (!user) throw new Error(`User with email ${email} does not exist.`)
        if (!user.password?.trim().length)
          throw new Error('User does not have a password.')
        if (!(await hash.compare(password, user.password)))
          throw new Error('Password is incorrect.')
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _addTeamOfSeason(user, session, seasonId)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityLoginGoogle',
    payload: io.object({
      seasonId: io.optional(io.string()),
      code: io.string().trim(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({seasonId, code, userAgent}) =>
      async () => {
        const {access_token} = await getGoogleAccessToken(code)
        const userInfo = await getGoogleUserInfo(access_token)
        const user = await userEmail.maybeUser(userInfo.email)
        if (!user) {
          const message = `There are no accounts with the email ${userInfo.email}. Please sign up before logging in with Google.`
          throw new Error(message)
        }
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _addTeamOfSeason(user, session, seasonId)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecuritySignUp',
    payload: io.object({
      seasonId: io.optional(io.string()),
      email: io.string().email().trim(),
      firstName: io.string(),
      lastName: io.string(),
      gender: io.string(),
      termsAccepted: io.boolean(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({seasonId, userAgent, email, firstName, termsAccepted, ...body}) =>
      async () => {
        if (!termsAccepted)
          throw new Error('Please accept our terms to create an account.')
        if (await userEmail.maybeUser(email))
          throw new Error(`User already exists with email "${email}".`)
        const code = await userEmail.codeSend(email, firstName, 'Verify Email')
        const user = await $User.createOne({
          ...body,
          firstName,
          termsAccepted,
          emails: [userEmail.create(email, true, code)],
        })
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _addTeamOfSeason(user, session, seasonId)
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
      seasonId: io.optional(io.string()),
      email: io.string().email(),
      code: io.string(),
      newPassword: io.string().emptyok(),
      userAgent: io.optional(io.string()),
    }),
    handler:
      ({seasonId, email, code, newPassword, userAgent}) =>
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
        return _addTeamOfSeason(user, session, seasonId)
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/SecurityLogout',
    handler: () => async (req) => {
      const auth = await gatekeeper.digestRequest(req)
      if (auth) {
        const session = await $Session.getOne({id: auth.sessionId})
        await $Session.updateOne(
          {id: session.id},
          {ended: true, endedOn: new Date().toISOString()}
        )
      }
    },
  }),
])
/**
 *
 */
export const _addTeamOfSeason = async (
  user: TUser,
  session: TSession,
  seasonId?: string
) => {
  let team: TTeam | undefined
  if (seasonId) {
    const season = await $Season.getOne({id: seasonId})
    const member = await $Member.maybeOne({
      userId: user.id,
      seasonId: seasonId,
      pending: false,
    })
    team = member ? await $Team.getOne({id: member.teamId}) : undefined
    if (user.lastSeasonId !== season.id)
      await $User.updateOne({id: user.id}, {lastSeasonId: season.id})
  }
  return {
    user,
    session,
    team,
  }
}
