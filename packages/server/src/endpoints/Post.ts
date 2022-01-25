import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Post} from '../tables/$Post'
import {createEndpoint} from '../utils/endpoints'
import {requireUser} from './requireUser'
import {regex} from '../utils/regex'
import {requireUserAdmin} from './requireUserAdmin'
import {$Season} from '../tables/$Season'
import {mail} from '../utils/mail'
import {$Member} from '../tables/$Member'
import {$User} from '../tables/$User'
import {purify} from '../utils/purify'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    path: '/PostListOfSeason',
    payload: io.object({
      seasonId: io.string(),
      search: io.optional(io.string().emptyok()),
      limit: io.optional(io.number()),
    }),
    handler:
      ({seasonId, search, limit}) =>
      async (req) => {
        await requireUser(req)
        const posts = await $Post.getMany(
          {seasonId, title: regex.from(search ?? '')},
          {limit, sort: {createdOn: -1}}
        )
        const users = await $User.getMany({
          id: {$in: posts.map((i) => i.userId)},
        })
        return {
          posts,
          users,
        }
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/PostCreate',
    payload: io.object({
      seasonId: io.string(),
      title: io.string(),
      content: io.string(),
      sendEmail: io.optional(io.boolean()),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      await $Season.getOne({id: body.seasonId})
      body.content = purify.sanitize(body.content)
      const post = await $Post.createOne({
        ...body,
        userId: user.id,
      })
      if (user.admin && body.sendEmail) {
        const memberCaptains = await $Member.getMany({
          captain: true,
          seasonId: body.seasonId,
        })
        const userCaptains = await $User.getMany({
          id: {$in: memberCaptains.map((i) => i.userId)},
        })
        await mail.send({
          to: userCaptains.map((i) => i.email),
          subject: post.title,
          html: post.content,
        })
      }
      return post
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
        const [user] = await requireUser(req)
        const post = await $Post.getOne({id: postId})
        if (post.userId !== user.id && !user.admin)
          throw new Error('Failed: you can only update your own posts.')
        body.content = purify.sanitize(body.content)
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
        const [user] = await requireUser(req)
        const post = await $Post.getOne({id: postId})
        if (post.userId !== user.id && !user.admin)
          throw new Error('Failed: you can only delete your own posts.')
        await $Post.deleteOne({id: postId})
      },
  }),
])
