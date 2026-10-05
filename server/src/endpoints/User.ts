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
  TUserListSortDirection,
  TUserListSortKey,
} from '@shared/endpoints/UserDef'
import {TReport} from '@shared/schemas/ioReport'
import {TUser} from '@shared/schemas/ioUser'
import {Document} from 'mongodb'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import authAttemptLimit from '../auth/attemptLimit'
import {createEndpoint} from '../http/createEndpoint'
import gatekeeper from '../auth/sessions'
import hash from '../auth/hash'
import intrusion from '../http/intrusion'
import mongo from '../db/mongo'
import {regex} from '../utils/regex'
import {requireAccess} from '../auth/requireAccess'
import {selectSafeUserFields} from '../services/userFields'
import {userEmail} from '../services/userEmail'

const USER_DEFAULT_SORT_BY: TUserListSortKey = 'createdOn'
const USER_DEFAULT_SORT_DIRECTION: TUserListSortDirection = 'desc'

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
        if (!userEmail.isCodeEqual(user, email, code))
          throw badRequestError(`Code is incorrect.`, {
            errorCode: 'user.code_invalid',
          })
        if (userEmail.isCodeExpired(user, email)) {
          await authAttemptLimit.consume('delivery', email, ip)
          await userEmail.codeSendSave(user, email, 'Verify Email')
          const message = `Your code has expired. A new code has been sent to your email.`
          throw badRequestError(message, {
            errorCode: 'user.code_expired',
          })
        }
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
      const regexSearch = regex.from(body.search ?? '')
      const query = {
        $or: [
          {firstName: regexSearch},
          {lastName: regexSearch},
          {'emails.value': regexSearch},
        ],
      }
      const sortBy = body.sortBy ?? USER_DEFAULT_SORT_BY
      const sortDirection = body.sortDirection ?? USER_DEFAULT_SORT_DIRECTION
      const [count, users] = await Promise.all([
        $User.count(query),
        $User.aggregate(
          _getUserListPipeline(
            query,
            sortBy,
            sortDirection,
            body.skip,
            body.limit,
          ),
        ),
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
        if (user1Id === user2Id)
          throw badRequestError('Cannot merge a user into itself.', {
            errorCode: 'user.merge_invalid',
          })
        let [user1, user2, u1Members, u2Members] = await Promise.all([
          $User.getOne({id: user1Id}),
          $User.getOne({id: user2Id}),
          $Member.getMany({userId: user1Id}),
          $Member.getMany({userId: user2Id}),
        ])
        await mongo.transaction(async () => {
          const updatedOn = new Date().toISOString()
          // members
          for (const u2m of u2Members) {
            const u1mOverlap = u1Members.find((u1m) => {
              return u1m.seasonId === u2m.seasonId && u1m.teamId === u2m.teamId
            })
            if (u1mOverlap) {
              if (u1mOverlap.pending && !u2m.pending) {
                await $Member.deleteOne({id: u1mOverlap.id})
                await $Member.updateOne({id: u2m.id}, {userId: user1.id, updatedOn})
              } else await $Member.deleteOne({id: u2m.id})
            } else
              await $Member.updateOne(
                {id: u2m.id},
                {userId: user1.id, updatedOn},
              )
          }
          await $Fixture.updateMany(
            {userId: user2.id},
            {userId: user1.id, updatedOn},
          )
          // reports
          const u2rs = await $Report.getMany({
            $or: [
              {userId: user2.id},
              {mvpMale: user2.id},
              {mvpMale2: user2.id},
              {mvpFemale: user2.id},
              {mvpFemale2: user2.id},
            ],
          })
          const u2rsBulk = u2rs.map((u2r) => ({
            query: {id: u2r.id},
            value: _mergeReportUserReferences(u2r, user1.id, user2.id, updatedOn),
          }))
          await $Report.updateBulk(u2rsBulk)
          await $Session.updateMany(
            {userId: user2.id},
            {userId: user1.id, updatedOn},
          )
          // users
          const emails = _mergeUserEmails(user1, user2)
          const userMergedIds = _mergeUserMergedIds(user1, user2)
          await $User.deleteOne({id: user2.id})
          user1 = await $User.updateOne(
            {id: user1.id},
            {
              admin: Boolean(user1.admin || user2.admin),
              avatarUrl: user1.avatarUrl ?? user2.avatarUrl,
              bio: user1.bio ?? user2.bio,
              emails,
              lastSeasonId: user1.lastSeasonId ?? user2.lastSeasonId,
              password: user1.password ?? user2.password,
              termsAccepted: user1.termsAccepted || user2.termsAccepted,
              updatedOn,
              userMergedIds,
            },
          )
        })
        return selectSafeUserFields(user1)
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

const _getUserSort = (
  sortBy: TUserListSortKey,
  sortDirection: TUserListSortDirection,
) => {
  const direction: 1 | -1 = sortDirection === 'asc' ? 1 : -1

  switch (sortBy) {
    case 'firstName':
      return {firstName: direction, lastName: 1 as const}
    case 'lastName':
      return {lastName: direction, firstName: 1 as const}
    case 'email':
      return {
        _sortPrimaryEmail: direction,
        lastName: 1 as const,
        firstName: 1 as const,
      }
    case 'gender':
      return {
        gender: direction,
        lastName: 1 as const,
        firstName: 1 as const,
      }
    case 'createdOn':
      return {createdOn: direction}
  }
}

const _getUserListPipeline = (
  query: Document,
  sortBy: TUserListSortKey,
  sortDirection: TUserListSortDirection,
  skip?: number,
  limit?: number,
): Document[] => {
  const pipeline: Document[] = [{$match: query}]

  if (sortBy === 'email') {
    pipeline.push({
      $addFields: {
        _sortPrimaryEmail: {
          $toLower: {
            $trim: {
              input: {
                $let: {
                  vars: {
                    primaryEmails: {
                      $map: {
                        input: {
                          $filter: {
                            input: '$emails',
                            as: 'email',
                            cond: '$$email.primary',
                          },
                        },
                        as: 'email',
                        in: '$$email.value',
                      },
                    },
                    firstEmails: {
                      $map: {
                        input: {$slice: ['$emails', 1]},
                        as: 'email',
                        in: '$$email.value',
                      },
                    },
                  },
                  in: {
                    $ifNull: [
                      {$first: '$$primaryEmails'},
                      {$ifNull: [{$first: '$$firstEmails'}, '']},
                    ],
                  },
                },
              },
            },
          },
        },
      },
    })
  }

  pipeline.push({$sort: _getUserSort(sortBy, sortDirection)})

  if (skip && skip > 0) pipeline.push({$skip: skip})
  if (limit !== undefined) pipeline.push({$limit: limit})
  if (sortBy === 'email') pipeline.push({$project: {_sortPrimaryEmail: 0}})

  return pipeline
}

const _mergeUserMergedIds = (user1: TUser, user2: TUser) => {
  return [
    ...new Set([...(user1.userMergedIds ?? []), user2.id, ...(user2.userMergedIds ?? [])]),
  ].filter((id) => id !== user1.id)
}

const _mergeUserEmails = (user1: TUser, user2: TUser): TUser['emails'] => {
  const emails = new Map<string, TUser['emails'][number]>()
  const primaryKey = _normalizeEmail(
    userEmail.primary(user1)?.value ?? userEmail.primary(user2)?.value ?? '',
  )

  for (const email of [...user1.emails, ...user2.emails]) {
    const key = _normalizeEmail(email.value)
    const current = emails.get(key)
    const preferred = current?.verified
      ? current
      : email.verified
        ? email
        : current ?? email
    const createdOn = current
      ? new Date(
          Math.min(
            new Date(current.createdOn).getTime(),
            new Date(email.createdOn).getTime(),
          ),
        ).toISOString()
      : preferred.createdOn
    emails.set(key, {
      ...preferred,
      createdOn,
      primary: key === primaryKey,
      value: preferred.value.trim(),
      verified: Boolean(current?.verified || email.verified),
    })
  }

  const merged = [...emails.values()]
  const primaryCount = merged.filter((email) => email.primary).length
  if (primaryCount !== 1 && merged.length) {
    merged.forEach((email, index) => {
      email.primary = index === 0
    })
  }
  return merged
}

const _normalizeEmail = (value: string) => value.trim().toLowerCase()

const _mergeReportUserReferences = (
  report: TReport,
  targetUserId: string,
  sourceUserId: string,
  updatedOn: string,
) => {
  const next = {
    userId: report.userId === sourceUserId ? targetUserId : report.userId,
    mvpMale: report.mvpMale === sourceUserId ? targetUserId : report.mvpMale,
    mvpMale2: report.mvpMale2 === sourceUserId ? targetUserId : report.mvpMale2,
    mvpFemale:
      report.mvpFemale === sourceUserId ? targetUserId : report.mvpFemale,
    mvpFemale2:
      report.mvpFemale2 === sourceUserId ? targetUserId : report.mvpFemale2,
    updatedOn,
  }

  if (next.mvpMale && next.mvpMale === next.mvpMale2) next.mvpMale2 = undefined
  if (next.mvpFemale && next.mvpFemale === next.mvpFemale2)
    next.mvpFemale2 = undefined
  if (next.mvpMale && next.mvpMale === next.mvpFemale) next.mvpFemale = undefined

  return next
}
