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
import {TUser} from '@shared/schemas/ioUser'
import {RequestHandler} from 'micro'
import {$Season} from '../tables/$Season'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import {createEndpoint} from '../http/createEndpoint'
import authAttemptLimit from '../auth/attemptLimit'
import gatekeeper from '../auth/sessions'
import hash from '../auth/hash'
import intrusion from '../http/intrusion'
import {buildAuthPayload} from '../services/authPayload'
import {userEmail} from '../services/userEmail'

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
              ? await buildAuthPayload(user, session, season.id)
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
        if (!user) return {status: 'unknown', email}
        if (!user.password) {
          const ip = intrusion.getClientIp(req)
          await authAttemptLimit.consume('delivery', email, ip)
          await userEmail.codeSendSave(user, email, 'Verify Email')
          return {status: 'password', email, firstName: user.firstName}
        }
        const verified = userEmail.get(user, email)?.verified
        return {
          status: verified ? 'good' : 'unverified',
          firstName: user.firstName,
          email,
        }
      },
  }),

  createEndpoint({
    ...SecurityLoginDef,
    handler:
      ({seasonId, email, password, userAgent}) =>
      async (req) => {
        const ip = intrusion.getClientIp(req)
        await authAttemptLimit.consume('login', email, ip)
        const user = await userEmail.maybeUser(email)
        if (!user?.password?.trim().length) {
          await hash.compareDummy(password)
          throw unauthorizedError(INVALID_LOGIN_MESSAGE, {
            errorCode: 'auth.invalid_login',
          })
        }
        if (!(await hash.compare(password, user.password))) {
          throw unauthorizedError(INVALID_LOGIN_MESSAGE, {
            errorCode: 'auth.invalid_login',
          })
        }
        await authAttemptLimit.reset('login', email, ip)
        const session = await gatekeeper.createUserSession(user, userAgent)
        return buildAuthPayload(user, session, seasonId)
      },
  }),

  createEndpoint({
    ...SecuritySignUpDef,
    handler:
      ({seasonId, userAgent, email, firstName, termsAccepted, ...body}) =>
      async (req) => {
        if (!termsAccepted)
          throw badRequestError(
            'Please accept our terms to create an account.',
            {errorCode: 'auth.terms_required'},
          )
        if (await userEmail.maybeUser(email))
          throw conflictError(`User already exists with email "${email}".`, {
            errorCode: 'user.email_exists',
          })
        await authAttemptLimit.consume(
          'delivery',
          email,
          intrusion.getClientIp(req),
        )
        const code = await userEmail.codeSend(email, firstName, 'Verify Email')
        const user = await $User.createOne({
          ...body,
          firstName,
          termsAccepted,
          emails: [userEmail.create(email, true, code)],
        })
        const session = await gatekeeper.createUserSession(user, userAgent)
        return buildAuthPayload(user, session, seasonId)
      },
  }),

  createEndpoint({
    ...SecurityForgotDef,
    handler: (email) => async (req) => {
      const ip = intrusion.getClientIp(req)
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
        await authAttemptLimit.consume('verify', email, ip)
        let user = await userEmail.maybeUser(email)
        if (!user)
          throw badRequestError(`Code is incorrect.`, {
            errorCode: 'user.code_invalid',
          })
        const expiredSubject = user.password ? 'Restore Account' : 'Verify Email'
        await userEmail.assertCodeValid(user, email, code, ip, expiredSubject)
        const passwordChanged = Boolean(
          newPassword.trim().length || !user.password,
        )
        if (passwordChanged) {
          hash.assertNewPasswordValid(newPassword)
          const password = await hash.encrypt(newPassword)
          user = await $User.updateOne({id: user.id}, {password})
        }
        user = await userEmail.verify(user, email)
        await authAttemptLimit.reset('verify', email, ip)
        // a reset proves control of the email, so sign out everywhere else
        if (passwordChanged) await gatekeeper.endUserSessions(user.id)
        const session = await gatekeeper.createUserSession(user, userAgent)
        return buildAuthPayload(user, session, seasonId)
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
