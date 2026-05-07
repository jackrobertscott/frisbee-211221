import {authPoint} from '@shared/auth/authAccess'
import {ioComment} from '@shared/schemas/ioComment'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const CommentListOfPostDef = {
  path: '/CommentListOfPost',
  payload: io.object({
    postId: ioComment.shape.postId,
    limit: io.optional(io.number()),
  }),
  result: io.object({
    comments: io.array(ioComment),
    users: io.array(ioUserPublic),
  }),
} satisfies TEndpointDef

export const CommentCreateDef = {
  access: authPoint.commentWrite,
  path: '/CommentCreate',
  payload: ioComment.pick(['postId', 'content', 'commentParentId']),
  result: ioComment,
} satisfies TEndpointDef

export const CommentUpdateDef = {
  access: authPoint.commentWrite,
  path: '/CommentUpdate',
  payload: ioComment.pick(['content']).extend({commentId: ioComment.shape.id}),
  result: ioComment,
} satisfies TEndpointDef

export const CommentDeleteDef = {
  access: authPoint.commentWrite,
  path: '/CommentDelete',
  payload: io.object({
    commentId: ioComment.shape.id,
  }),
} satisfies TEndpointDef
