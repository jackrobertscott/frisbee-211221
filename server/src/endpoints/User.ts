import {badRequestError, conflictError} from '@shared/errors'
import {
  UserChangePasswordDef,
  UserCreateDef,
  UserCurrentChangePasswordDef,
  UserCurrentEmailAddDef,
  UserCurrentEmailCodeResendDef,
  UserCurrentEmailPrimarySetDef,
  UserCurrentEmailRemoveDef,
  UserCurrentEmailVerifyDef,
  UserEmailAddDef,
  UserEmailPrimarySetDef,
  UserEmailRemoveDef,
  UserEmailVerifiedSetDef,
  UserCurrentUpdateDef,
  UserListDef,
  UserMergeDef,
  UserToggleAdminDef,
  UserUpdateDef,
} from '@shared/endpoints/UserDef'
import {RequestHandler} from 'micro'
import {$User} from '../tables/$User'
import authAttemptLimit from '../auth/attemptLimit'
import {createEndpoint} from '../http/createEndpoint'
import gatekeeper from '../auth/sessions'
import hash from '../auth/hash'
import intrusion from '../http/intrusion'
import {requireAccess} from '../auth/requireAccess'
import {selectSafeUserFields} from '../services/userFields'
import {userEmail} from '../services/userEmail'
import {mergeUsers} from '../services/userMerge'
import {
  getUserListPipeline,
  getUserListQuery,
  USER_LIST_DEFAULT_SORT_BY,
  USER_LIST_DEFAULT_SORT_DIRECTION,
} from '../queries/userList'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...UserCurrentUpdateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const next = await $User.updateOne(
        {id: user.id},
        {
          ...body,
          updatedOn: new Date().toISOString(),
        },
      )
      return selectSafeUserFields(next)
    },
  }),

  createEndpoint({
    ...UserCurrentEmailAddDef,
    handler:
      ({email}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        await authAttemptLimit.consume(
          'delivery',
          email,
          intrusion.getClientIp(req),
        )
        return selectSafeUserFields(await userEmail.add(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailVerifyDef,
    handler:
      ({email, code}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        const ip = intrusion.getClientIp(req)
        await authAttemptLimit.consume('verify', email, ip)
        await userEmail.assertCodeValid(user, email, code, ip, 'Verify Email')
        const next = await userEmail.verify(user, email)
        await authAttemptLimit.reset('verify', email, ip)
        return selectSafeUserFields(next)
      },
  }),

  createEndpoint({
    ...UserCurrentEmailCodeResendDef,
    handler:
      ({email}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        await authAttemptLimit.consume(
          'delivery',
          email,
          intrusion.getClientIp(req),
        )
        return selectSafeUserFields(
          await userEmail.codeSendSave(user, email, 'Verify Email'),
        )
      },
  }),

  createEndpoint({
    ...UserCurrentEmailPrimarySetDef,
    handler:
      ({email}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        return selectSafeUserFields(await userEmail.primarySet(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailRemoveDef,
    handler:
      ({email}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        return selectSafeUserFields(await userEmail.remove(user, email))
      },
  }),

  createEndpoint({
    ...UserEmailAddDef,
    handler:
      ({userId, email}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const user = await $User.getOne({id: userId})
        return selectSafeUserFields(await userEmail.add(user, email))
      },
  }),

  createEndpoint({
    ...UserEmailPrimarySetDef,
    handler:
      ({userId, email}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const user = await $User.getOne({id: userId})
        return selectSafeUserFields(await userEmail.primarySet(user, email))
      },
  }),

  createEndpoint({
    ...UserEmailVerifiedSetDef,
    handler:
      ({userId, email, verified}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const user = await $User.getOne({id: userId})
        return selectSafeUserFields(
          await userEmail.verifiedSet(user, email, verified),
        )
      },
  }),

  createEndpoint({
    ...UserEmailRemoveDef,
    handler:
      ({userId, email}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const user = await $User.getOne({id: userId})
        return selectSafeUserFields(await userEmail.remove(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentChangePasswordDef,
    handler: (body, access) => async (req) => {
      let [user, session] = await requireAccess(req, access)
      if (!user.password)
        throw badRequestError('User does not have a password.', {
          errorCode: 'user.password_missing',
        })
      if (!(await hash.compare(body.oldPassword, user.password)))
        throw badRequestError('Old password is incorrect.', {
          errorCode: 'user.old_password_invalid',
        })
      hash.assertNewPasswordValid(body.newPassword)
      user = await $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)},
      )
      await gatekeeper.endUserSessions(user.id, session.id)
      return selectSafeUserFields(user)
    },
  }),

  createEndpoint({
    ...UserListDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      const query = getUserListQuery(body.search)
      const pipeline = getUserListPipeline(
        query,
        body.sortBy ?? USER_LIST_DEFAULT_SORT_BY,
        body.sortDirection ?? USER_LIST_DEFAULT_SORT_DIRECTION,
        body.skip,
        body.limit,
      )
      const [count, users] = await Promise.all([
        $User.count(query),
        $User.aggregate(pipeline),
      ])
      return {count, users: users.map(selectSafeUserFields)}
    },
  }),

  createEndpoint({
    ...UserCreateDef,
    handler:
      ({email, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        if (await userEmail.maybeUser(email))
          throw conflictError(`User already exists with email "${email}".`, {
            errorCode: 'user.email_exists',
          })
        const emails = [userEmail.create(email, true)]
        const user = await $User.createOne({
          ...body,
          emails,
        })
        return selectSafeUserFields(user)
      },
  }),

  createEndpoint({
    ...UserUpdateDef,
    handler:
      ({userId, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const user = await $User.getOne({id: userId})
        const next = await $User.updateOne(
          {id: user.id},
          {...body, updatedOn: new Date().toISOString()},
        )
        return selectSafeUserFields(next)
      },
  }),

  createEndpoint({
    ...UserToggleAdminDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      const user = await $User.getOne({id: body.userId})
      const next = await $User.updateOne({id: user.id}, {admin: !user.admin})
      return selectSafeUserFields(next)
    },
  }),

  createEndpoint({
    ...UserMergeDef,
    handler:
      ({user1Id, user2Id}, access) =>
      async (req) => {
        await requireAccess(req, access)
        return selectSafeUserFields(await mergeUsers(user1Id, user2Id))
      },
  }),

  createEndpoint({
    ...UserChangePasswordDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      hash.assertNewPasswordValid(body.newPassword)
      const user = await $User.getOne({id: body.userId})
      const next = await $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)},
      )
      await gatekeeper.endUserSessions(user.id)
      return selectSafeUserFields(next)
    },
  }),
])
