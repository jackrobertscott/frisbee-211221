import {badRequestError, conflictError} from '@shared/errors'
import {UserChangePasswordDef, UserCreateDef, UserCurrentChangePasswordDef, UserCurrentEmailAddDef, UserCurrentEmailCodeResendDef, UserCurrentEmailPrimarySetDef, UserCurrentEmailRemoveDef, UserCurrentEmailVerifyDef, UserCurrentUpdateDef, UserListDef, UserMergeDef, UserToggleAdminDef, UserUpdateDef, TUserListSortDirection, TUserListSortKey} from '@shared/endpoints/UserDef'
import {Document} from 'mongodb'
import {RequestHandler} from 'micro'
import {$Comment} from '../tables/$Comment'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
import {$Report} from '../tables/$Report'
import {$Session} from '../tables/$Session'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import hash from '../utils/hash'
import mongo from '../utils/mongo'
import {regex} from '../utils/regex'
import {requireAccess} from './requireAccess'
import {selectSafeUserFields} from './userSafe'
import {userEmail} from './userEmail'

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
        }
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
        return selectSafeUserFields(await userEmail.add(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailVerifyDef,
    handler:
      ({email, code}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        if (!userEmail.isCodeEqual(user, email, code))
          throw badRequestError(`Code is incorrect.`, {
            errorCode: 'user.code_invalid',
          })
        if (userEmail.isCodeExpired(user, email)) {
          await userEmail.codeSendSave(user, email, 'Verify Email')
          const message = `Your code has expired. A new code has been sent to your email.`
          throw badRequestError(message, {
            errorCode: 'user.code_expired',
          })
        }
        return selectSafeUserFields(await userEmail.verify(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailCodeResendDef,
    handler:
      ({email}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        return selectSafeUserFields(
          await userEmail.codeSendSave(user, email, 'Verify Email')
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
    ...UserCurrentChangePasswordDef,
    handler: (body, access) => async (req) => {
      let [user] = await requireAccess(req, access)
      if (!user.password)
        throw badRequestError('User does not have a password.', {
          errorCode: 'user.password_missing',
        })
      if (!(await hash.compare(body.oldPassword, user.password)))
        throw badRequestError('Old password is incorrect.', {
          errorCode: 'user.old_password_invalid',
        })
      user = await $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
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
          _getUserListPipeline(query, sortBy, sortDirection, body.skip, body.limit)
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
          {...body, updatedOn: new Date().toISOString()}
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
        let [user1, user2, u1Members, u2Members] = await Promise.all([
          $User.getOne({id: user1Id}),
          $User.getOne({id: user2Id}),
          $Member.getMany({userId: user1Id}),
          $Member.getMany({userId: user2Id}),
        ])
        await mongo.transaction(async () => {
          // members
          const taskMembers = u2Members.map(async (u2m) => {
            const u1mOverlap = u1Members.find((u1m) => {
              return u1m.seasonId === u2m.seasonId && u1m.teamId === u2m.teamId
            })
            if (u1mOverlap) {
              if (u1mOverlap.pending && !u2m.pending) {
                return Promise.all([
                  $Member.deleteOne({id: u1mOverlap.id}),
                  $Member.updateOne({id: u2m.id}, {userId: user1.id}),
                ])
              } else return $Member.deleteOne({id: u2m.id})
            } else return $Member.updateOne({id: u2m.id}, {userId: user1.id})
          })
          await Promise.all(taskMembers)
          // comments
          const u2cs = await $Comment.getMany({userId: user2.id})
          const u2csBulk = u2cs.map((u2c) => ({
            query: {id: u2c.id},
            value: {userId: user1.id},
          }))
          await $Comment.updateBulk(u2csBulk)
          // posts
          const u2ps = await $Post.getMany({userId: user2.id})
          const u2psBulk = u2ps.map((u2p) => ({
            query: {id: u2p.id},
            value: {userId: user1.id},
          }))
          await $Post.updateBulk(u2psBulk)
          // reports
          const u2rs = await $Report.getMany({
            $or: [
              {userId: user2.id},
              {mvpMale: user2.id},
              {mvpFemale: user2.id},
            ],
          })
          const u2rsBulk = u2rs
            .map((u2r) => ({
              query: {id: u2r.id},
              value: {
                userId: u2r.userId === user2.id ? user1.id : u2r.userId,
                mvpMale: u2r.mvpMale === user2.id ? user1.id : u2r.mvpMale,
                mvpFemale:
                  u2r.mvpFemale === user2.id ? user1.id : u2r.mvpFemale,
              },
            }))
            .map(({query, value}) => ({
              query,
              value:
                value.mvpMale === value.mvpFemale
                  ? {...value, mvpFemale: ''}
                  : value,
            }))
          await $Report.updateBulk(u2rsBulk)
          // sessions
          const u2ss = await $Session.getMany({userId: user2.id})
          const u2ssBulk = u2ss.map((u2s) => ({
            query: {id: u2s.id},
            value: {userId: user1.id},
          }))
          await $Session.updateBulk(u2ssBulk)
          // users
          const u1Emails = [...(user1.emails ?? []), ...(user2.emails ?? [])]
          const u2MergedIds = [...(user1.userMergedIds ?? []), user2.id]
          await $User.deleteOne({id: user2.id})
          user1 = await $User.updateOne(
            {id: user1.id},
            {
              emails: u1Emails,
              userMergedIds: u2MergedIds,
            }
          )
        })
        return selectSafeUserFields(user1)
      },
  }),

  createEndpoint({
    ...UserChangePasswordDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      const user = await $User.getOne({id: body.userId})
      const next = await $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
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
      return {firstName: direction, lastName: 1 as const, id: 1 as const}
    case 'lastName':
      return {lastName: direction, firstName: 1 as const, id: 1 as const}
    case 'email':
      return {
        _sortPrimaryEmail: direction,
        lastName: 1 as const,
        firstName: 1 as const,
        id: 1 as const,
      }
    case 'gender':
      return {gender: direction, lastName: 1 as const, firstName: 1 as const, id: 1 as const}
    case 'createdOn':
      return {createdOn: direction, id: 1 as const}
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
