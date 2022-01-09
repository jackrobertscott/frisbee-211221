import {RequestHandler} from 'micro'
import {io} from 'torva'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {$User} from '../tables/$User'
import hash from '../utils/hash'
import {requireUserAdmin} from './requireUserAdmin'
import {regex} from '../utils/regex'
import {random} from '../utils/random'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/UserUpdateCurrent',
    payload: io.object({
      firstName: io.optional(io.string()),
      lastName: io.optional(io.string()),
      gender: io.optional(io.enum(['male', 'female'])),
      avatarUrl: io.optional(io.string()),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      return $User.updateOne(
        {id: user.id},
        {
          ...body,
          updatedOn: new Date().toISOString(),
        }
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserChangePassword',
    payload: io.object({
      oldPassword: io.string(),
      newPassword: io.string(),
    }),
    handler: (body) => async (req) => {
      let [user] = await requireUser(req)
      if (!user.password) throw new Error('User does not have a password.')
      if (!(await hash.compare(body.oldPassword, user.password)))
        throw new Error('Old password is incorrect.')
      return $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserList',
    payload: io.object({
      search: io.optional(io.string().emptyok()),
      limit: io.optional(io.number()),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const regexSearch = regex.from(body.search ?? '')
      return $User.getMany(
        {
          $or: [
            {firstName: regexSearch},
            {lastName: regexSearch},
            {email: regexSearch},
          ],
        },
        {
          limit: body.limit,
        }
      )
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserToggleAdmin',
    payload: io.object({
      userId: io.string(),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      const user = await $User.getOne({id: body.userId})
      return $User.updateOne({id: user.id}, {admin: !user.admin})
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserUpdate',
    payload: io.object({
      userId: io.string(),
      firstName: io.optional(io.string()),
      lastName: io.optional(io.string()),
      gender: io.optional(io.enum(['male', 'female'])),
      avatarUrl: io.optional(io.string()),
    }),
    handler:
      ({userId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        const user = await $User.getOne({id: userId})
        return $User.updateOne(
          {id: user.id},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/UserCreate',
    payload: io.object({
      email: io.string().email().trim(),
      firstName: io.string(),
      lastName: io.string(),
      gender: io.enum(['male', 'female']),
      password: io.optional(io.string().emptyok()),
      termsAccepted: io.boolean(),
    }),
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      if (!body.password?.length) body.password = undefined
      else if (body.password.length < 5)
        throw new Error('Password must be at least 5 characters long.')
      if (!body.termsAccepted)
        throw new Error('The user must accept the terms and conditions.')
      if (await $User.count({email: regex.normalize(body.email)}))
        throw new Error(`User already exists with email "${body.email}".`)
      return $User.createOne({
        ...body,
        password: body.password ? await hash.encrypt(body.password) : undefined,
        emailVerified: false,
        emailCode: random.generateId(), // code,
        emailCodeCreatedOn: new Date().toISOString(),
      })
    },
  }),
])
