import {RequestHandler} from 'micro'
import {io} from 'torva'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {mail} from '../utils/mail'
import {purify} from '../utils/purify'
import {regex} from '../utils/regex'
import {requireUser} from './requireUser'
import {userEmail} from './userEmail'
import {selectPublicUserFields} from './userPublic'
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
      async () => {
        const posts = await $Post.getMany(
          {title: regex.from(search ?? '')},
          {limit, sort: {createdOn: -1}}
        )
        const users = await $User.getMany({
          id: {$in: posts.map((i) => i.userId)},
        })
        return {
          posts,
          users: users.map(selectPublicUserFields),
        }
      },
  }),
  /**
   *
   */
  createEndpoint({
    path: '/PostCreate',
    payload: io.object({
      seasonId: io.optional(io.string()),
      title: io.string(),
      content: io.string(),
      sendEmail: io.optional(io.boolean()),
    }),
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
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
        const toEmailTasks = userCaptains.map((i) => userEmail.primary(i))
        const toEmailPayloads = await Promise.all(toEmailTasks)
        const toEmails = toEmailPayloads.map((i) => i.value).filter((i) => i)
        if (toEmails.length)
          await mail.send({
            to: toEmails,
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
