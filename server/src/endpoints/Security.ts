import {SecurityCurrentDef, SecurityForgotDef, SecurityLoginDef, SecurityLoginGoogleDef, SecurityLogoutDef, SecuritySignUpDef, SecurityStatusDef, SecurityVerifyDef} from '@shared/endpoints/SecurityDef'
import {TSeason} from '@shared/schemas/ioSeason'
import {TSession} from '@shared/schemas/ioSession'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUser} from '@shared/schemas/ioUser'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Season} from '../tables/$Season'
import {$Session} from '../tables/$Session'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import gatekeeper from '../utils/gatekeeper'
import {getGoogleAccessToken, getGoogleUserInfo} from '../utils/google'
import hash from '../utils/hash'
import {selectSafeUserFields} from './userSafe'
import {userEmail} from './userEmail'

const INVALID_LOGIN_MESSAGE = 'Email or password is incorrect.'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...SecurityCurrentDef,
    handler:
      ({seasonId}) =>
      async (req) => {
        const auth = await gatekeeper.digestRequest(req)
        let user: TUser | undefined
        let session: TSession | undefined
        if (auth?.userId && auth.sessionId) {
          const [maybeUser, maybeSession] = await Promise.all([
            $User.maybeOne({id: auth.userId}),
            $Session.maybeOne({id: auth.sessionId}),
          ])
          if (
            maybeUser &&
            maybeSession &&
            gatekeeper.isSessionValid(auth, maybeSession)
          ) {
            user = userEmail.isOld(maybeUser)
              ? await userEmail.migrate(maybeUser)
              : maybeUser
            session = maybeSession
          }
        }
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

  createEndpoint({
    ...SecurityStatusDef,
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

  createEndpoint({
    ...SecurityLoginDef,
    handler:
      ({seasonId, email, password, userAgent}) =>
      async () => {
        const user = await userEmail.maybeUser(email)
        if (!user?.password?.trim().length) throw new Error(INVALID_LOGIN_MESSAGE)
        if (!(await hash.compare(password, user.password))) {
          throw new Error(INVALID_LOGIN_MESSAGE)
        }
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _addTeamOfSeason(user, session, seasonId)
      },
  }),

  createEndpoint({
    ...SecurityLoginGoogleDef,
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

  createEndpoint({
    ...SecuritySignUpDef,
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

  createEndpoint({
    ...SecurityForgotDef,
    handler: (email) => async () => {
      const user = await userEmail.maybeUser(email)
      if (user) await userEmail.codeSendSave(user, email, 'Restore Account')
    },
  }),

  createEndpoint({
    ...SecurityVerifyDef,
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

  createEndpoint({
    ...SecurityLogoutDef,
    handler: () => async (req) => {
      const auth = await gatekeeper.digestRequest(req)
      if (!auth) return
      const session = await $Session.maybeOne({id: auth.sessionId})
      if (!session || !gatekeeper.isSessionValid(auth, session)) return
      await $Session.updateOne(
        {id: session.id},
        {ended: true, endedOn: new Date().toISOString()}
      )
    },
  }),
])

export const _addTeamOfSeason = async (
  rawUser: TUser,
  session: TSession,
  seasonId?: string
) => {
  let user = rawUser
  let team: TTeam | undefined
  if (seasonId) {
    const season = await $Season.getOne({id: seasonId})
    const member = await $Member.maybeOne({
      userId: user.id,
      seasonId: seasonId,
      pending: false,
    })
    team = member ? await $Team.getOne({id: member.teamId}) : undefined
    if (user.lastSeasonId !== season.id) {
      user = await $User.updateOne({id: user.id}, {lastSeasonId: season.id})
    }
  }
  return {
    user: selectSafeUserFields(user),
    session,
    team,
  }
}
