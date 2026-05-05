import {forbiddenError} from '@shared/errors'
import {
  PostCreateDef,
  PostDeleteDef,
  PostListDef,
  PostUpdateDef,
} from '@shared/endpoints/PostDef'
import DOMPurify from 'dompurify'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {mail} from '../utils/mail'
import {regex} from '../utils/regex'
import {requireAccess} from './requireAccess'
import {userEmail} from './userEmail'
import {selectPublicUserFields} from './userPublic'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...PostListDef,
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

  createEndpoint({
    ...PostCreateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      body.content = DOMPurify.sanitize(body.content)
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
        const toEmails = userCaptains
          .map((i) => userEmail.primary(i)?.value)
          .filter((i): i is string => Boolean(i))
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

  createEndpoint({
    ...PostUpdateDef,
    handler:
      ({postId, ...body}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        const post = await $Post.getOne({id: postId})
        if (post.userId !== user.id && !user.admin)
          throw forbiddenError('Failed: you can only update your own posts.', {
            errorCode: 'post.update_forbidden',
          })
        body.content = DOMPurify.sanitize(body.content)
        return $Post.updateOne(
          {id: postId},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),

  createEndpoint({
    ...PostDeleteDef,
    handler:
      ({postId}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        const post = await $Post.getOne({id: postId})
        if (post.userId !== user.id && !user.admin)
          throw forbiddenError('Failed: you can only delete your own posts.', {
            errorCode: 'post.delete_forbidden',
          })
        await $Post.deleteOne({id: postId})
      },
  }),
])
