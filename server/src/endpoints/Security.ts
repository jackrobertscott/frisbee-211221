import {
  badRequestError,
  conflictError,
  notFoundError,
  unauthorizedError,
} from '@shared/errors'
import {
  SecurityCurrentDef,
  SecurityForgotDef,
  SecurityLoginDef,
  SecurityLogoutDef,
  SecuritySignUpDef,
  SecurityStatusDef,
  SecurityVerifyDef,
} from '@shared/endpoints/SecurityDef'
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
import authAttemptLimit from '../utils/authAttemptLimit'
import gatekeeper from '../utils/gatekeeper'
import hash from '../utils/hash'
import intrusion from '../utils/intrusion'
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
            user = maybeUser
            session = maybeSession
          }
        }
        let season: TSeason | undefined
        if (seasonId) season = await $Season.maybeOne({id: seasonId})
        if (!season && user?.lastSeasonId)
          season = await $Season.maybeOne({id: user.lastSeasonId})
        season ??= await $Season.maybeOne({}, {sort: {createdOn: -1}})
        if (!season)
          throw notFoundError('No season is available.', {
            errorCode: 'season.not_found',
          })
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
      async (req) => {
        const user = await userEmail.maybeUser(email)
        let data: {status: string; email: string; firstName?: string}
        if (!user) {
          data = {status: 'unknown', email}
        } else if (!user.password) {
          const ip = intrusion.getClientIp(req)
          await authAttemptLimit.assertAllowed('delivery', email, ip)
          await authAttemptLimit.consume('delivery', email, ip)
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
      async (req) => {
        const ip = intrusion.getClientIp(req)
        await authAttemptLimit.assertAllowed('login', email, ip)
        const user = await userEmail.maybeUser(email)
        if (!user?.password?.trim().length) {
          await authAttemptLimit.registerFailure('login', email, ip)
          throw unauthorizedError(INVALID_LOGIN_MESSAGE, {
            errorCode: 'auth.invalid_login',
          })
        }
        if (!(await hash.compare(password, user.password))) {
          await authAttemptLimit.registerFailure('login', email, ip)
          throw unauthorizedError(INVALID_LOGIN_MESSAGE, {
            errorCode: 'auth.invalid_login',
          })
        }
        await authAttemptLimit.reset('login', email, ip)
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
          throw badRequestError(
            'Please accept our terms to create an account.',
            {
              errorCode: 'auth.terms_required',
            },
          )
        if (await userEmail.maybeUser(email))
          throw conflictError(`User already exists with email "${email}".`, {
            errorCode: 'user.email_exists',
          })
        const code = await userEmail.codeSend(email, firstName, 'Verify Email')
        const emails = [userEmail.create(email, true, code)]
        const user = await $User.createOne({
          ...body,
          firstName,
          termsAccepted,
          emails,
        })
        const session = await gatekeeper.createUserSession(user, userAgent)
        return _addTeamOfSeason(user, session, seasonId)
      },
  }),

  createEndpoint({
    ...SecurityForgotDef,
    handler: (email) => async (req) => {
      const ip = intrusion.getClientIp(req)
      await authAttemptLimit.assertAllowed('delivery', email, ip)
      await authAttemptLimit.consume('delivery', email, ip)
      const user = await userEmail.maybeUser(email)
      if (user) await userEmail.codeSendSave(user, email, 'Restore Account')
    },
  }),

  createEndpoint({
    ...SecurityVerifyDef,
    handler:
      ({seasonId, email, code, newPassword, userAgent}) =>
      async (req) => {
        const ip = intrusion.getClientIp(req)
        await authAttemptLimit.assertAllowed('verify', email, ip)
        let user = await userEmail.maybeUser(email)
        if (!user) {
          await authAttemptLimit.registerFailure('verify', email, ip)
          throw badRequestError(`Code is incorrect.`, {
            errorCode: 'user.code_invalid',
          })
        }
        if (!userEmail.isCodeEqual(user, email, code)) {
          await authAttemptLimit.registerFailure('verify', email, ip)
          throw badRequestError(`Code is incorrect.`, {
            errorCode: 'user.code_invalid',
          })
        }
        if (userEmail.isCodeExpired(user, email)) {
          await authAttemptLimit.assertAllowed('delivery', email, ip)
          await authAttemptLimit.consume('delivery', email, ip)
          const subject = user.password ? 'Restore Account' : 'Verify Email'
          await userEmail.codeSendSave(user, email, subject)
          const message = `Your code has expired. A new code has been sent to your email.`
          throw badRequestError(message, {
            errorCode: 'user.code_expired',
          })
        }
        if (newPassword.trim().length || !user.password) {
          if (newPassword.length < 5)
            throw badRequestError(
              'Password must be at least 5 characters long.',
              {
                errorCode: 'user.password_too_short',
              },
            )
          const password = await hash.encrypt(newPassword)
          user = await $User.updateOne({id: user.id}, {password})
        }
        user = await userEmail.verify(user, email)
        await authAttemptLimit.reset('verify', email, ip)
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
        {ended: true, endedOn: new Date().toISOString()},
      )
    },
  }),
])

export const _addTeamOfSeason = async (
  rawUser: TUser,
  session: TSession,
  seasonId?: string,
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
