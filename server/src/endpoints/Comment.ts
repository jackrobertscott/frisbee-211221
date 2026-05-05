import {forbiddenError} from '@shared/errors'
import {authPoint} from '@shared/auth/authAccess'
import {
  CommentListOfPostDef,
  CommentCreateDef,
  CommentUpdateDef,
  CommentDeleteDef,
} from '@shared/endpoints/CommentDef'
import {RequestHandler} from 'micro'
import {$Comment} from '../tables/$Comment'
import {$Post} from '../tables/$Post'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {requireAccess} from './requireAccess'
import {selectPublicUserFields} from './userPublic'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...CommentListOfPostDef,
    handler:
      ({postId, limit}) =>
      async (req) => {
        const comments = await $Comment.getMany(
          {postId},
          {limit, sort: {createdOn: -1}},
        )
        const userIds = [...new Set(comments.map((i) => i.userId))]
        const users = await $User.getMany({id: {$in: userIds}})
        return {comments, users: users.map(selectPublicUserFields)}
      },
  }),

  createEndpoint({
    ...CommentCreateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      await $Post.getOne({id: body.postId})
      return $Comment.createOne({
        ...body,
        userId: user.id,
      })
    },
  }),

  createEndpoint({
    ...CommentUpdateDef,
    handler:
      ({commentId, ...body}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, authPoint.commentWrite)
        const comment = await $Comment.getOne({id: commentId})
        if (comment.userId !== user.id) await requireAccess(req, access)
        if (!user.admin && comment.userId !== user.id) {
          const message =
            'User did not create this comment and therefore can not update it.'
          throw forbiddenError(message, {
            errorCode: 'comment.update_forbidden',
          })
        }
        return $Comment.updateOne(
          {id: commentId},
          {...body, updatedOn: new Date().toISOString()},
        )
      },
  }),

  createEndpoint({
    ...CommentDeleteDef,
    handler:
      ({commentId}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, authPoint.commentWrite)
        const comment = await $Comment.getOne({id: commentId})
        if (comment.userId !== user.id) await requireAccess(req, access)
        if (!user.admin && comment.userId !== user.id) {
          const message =
            'User did not create this comment and therefore can not delete it.'
          throw forbiddenError(message, {
            errorCode: 'comment.delete_forbidden',
          })
        }
        await $Comment.deleteOne({id: commentId})
      },
  }),
])
