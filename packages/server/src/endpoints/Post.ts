import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Post} from '../tables/Post'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {regex} from '../utils/regex'
import {requireUserAdmin} from './requireUserAdmin'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/PostList',
    payload: io.object({
      search: io.optional(io.string().emptyok()),
      limit: io.optional(io.number()),
    }),
    handler:
      ({search, limit}) =>
      async (req) => {
        await requireUser(req)
        return $Post.getMany(
          {title: regex.from(search ?? '')},
          {limit, sort: {createdOn: -1}}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/PostCreate',
    payload: io.object({
      title: io.string(),
      content: io.string(),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUserAdmin(req)
      return $Post.createOne({
        ...body,
        userId: user.id,
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/PostUpdate',
    payload: io.object({
      postId: io.string(),
      title: io.string(),
      content: io.string(),
    }),
    handler:
      ({postId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Post.updateOne(
          {id: postId},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/PostDelete',
    payload: io.object({
      postId: io.string(),
    }),
    handler:
      ({postId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Post.deleteOne({id: postId})
      },
  }),
])
