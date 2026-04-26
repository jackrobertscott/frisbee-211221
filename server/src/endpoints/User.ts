import {UserChangePasswordDef, UserCreateDef, UserCurrentChangePasswordDef, UserCurrentEmailAddDef, UserCurrentEmailCodeResendDef, UserCurrentEmailPrimarySetDef, UserCurrentEmailRemoveDef, UserCurrentEmailVerifyDef, UserCurrentUpdateDef, UserListDef, UserListManyByIdDef, UserMergeDef, UserToggleAdminDef, UserUpdateDef} from '@shared/endpoints/UserDef'
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
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
import {selectPublicUserFields} from './userPublic'
import {selectSafeUserFields} from './userSafe'
import {userEmail} from './userEmail'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...UserCurrentUpdateDef,
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
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
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return selectSafeUserFields(await userEmail.add(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailVerifyDef,
    handler:
      ({email, code}) =>
      async (req) => {
        const [user] = await requireUser(req)
        if (!userEmail.isCodeEqual(user, email, code))
          throw new Error(`Code is incorrect.`)
        if (userEmail.isCodeExpired(user, email)) {
          await userEmail.codeSendSave(user, email, 'Verify Email')
          const message = `Your code has expired. A new code has been sent to your email.`
          throw new Error(message)
        }
        return selectSafeUserFields(await userEmail.verify(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailCodeResendDef,
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return selectSafeUserFields(
          await userEmail.codeSendSave(user, email, 'Verify Email')
        )
      },
  }),

  createEndpoint({
    ...UserCurrentEmailPrimarySetDef,
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return selectSafeUserFields(await userEmail.primarySet(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentEmailRemoveDef,
    handler:
      ({email}) =>
      async (req) => {
        const [user] = await requireUser(req)
        return selectSafeUserFields(await userEmail.remove(user, email))
      },
  }),

  createEndpoint({
    ...UserCurrentChangePasswordDef,
    handler: (body) => async (req) => {
      let [user] = await requireUser(req)
      if (!user.password) throw new Error('User does not have a password.')
      if (!(await hash.compare(body.oldPassword, user.password)))
        throw new Error('Old password is incorrect.')
      user = await $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
      return selectSafeUserFields(user)
    },
  }),

  createEndpoint({
    ...UserListDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const regexSearch = regex.from(body.search ?? '')
      const [count, users] = await Promise.all([
        $User.count({}),
        $User.getMany(
          {
            $or: [
              {firstName: regexSearch},
              {lastName: regexSearch},
              {email: regexSearch},
            ],
          },
          {
            limit: body.limit,
            skip: body.skip,
          }
        ),
      ])
      return {count, users: users.map(selectSafeUserFields)}
    },
  }),

  createEndpoint({
    ...UserListManyByIdDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const users = await $User.getMany({id: {$in: body.userIds}})
      return users.map(selectPublicUserFields)
    },
  }),

  createEndpoint({
    ...UserCreateDef,
    handler:
      ({email, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        if (await userEmail.maybeUser(email))
          throw new Error(`User already exists with email "${email}".`)
        const user = await $User.createOne({
          ...body,
          emails: [userEmail.create(email, true)],
        })
        return selectSafeUserFields(user)
      },
  }),

  createEndpoint({
    ...UserUpdateDef,
    handler:
      ({userId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
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
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const user = await $User.getOne({id: body.userId})
      const next = await $User.updateOne({id: user.id}, {admin: !user.admin})
      return selectSafeUserFields(next)
    },
  }),

  createEndpoint({
    ...UserMergeDef,
    handler:
      ({user1Id, user2Id}) =>
      async (req) => {
        await requireUserAdmin(req)
        let [user1, user2, u1Members, u2Members] = await Promise.all([
          $User.getOne({id: user1Id}),
          $User.getOne({id: user2Id}),
          $Member.getMany({userId: user1Id}),
          $Member.getMany({userId: user2Id}),
        ])
        await mongo.transaction(async () => {
          if (userEmail.isOld(user1)) user1 = await userEmail.migrate(user1)
          if (userEmail.isOld(user2)) user2 = await userEmail.migrate(user2)
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
            {emails: u1Emails, userMergedIds: u2MergedIds}
          )
        })
        return selectSafeUserFields(user1)
      },
  }),

  createEndpoint({
    ...UserChangePasswordDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const user = await $User.getOne({id: body.userId})
      const next = await $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
      return selectSafeUserFields(next)
    },
  }),
])
