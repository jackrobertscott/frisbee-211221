import {RequestHandler} from 'micro'
import {io} from 'torva'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {$User} from '../tables/User'
import hash from '../utils/hash'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/UserUpdate',
    payload: io.object({
      firstName: io.optional(io.string()),
      lastName: io.optional(io.string()),
      businessMode: io.optional(io.boolean()),
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
      if (!(await hash.compare(body.oldPassword, user.password)))
        throw new Error('Old password is incorrect.')
      return $User.updateOne(
        {id: user.id},
        {password: await hash.encrypt(body.newPassword)}
      )
    },
  }),
])
