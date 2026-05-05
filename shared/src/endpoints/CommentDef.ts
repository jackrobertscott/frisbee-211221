import {authPoint} from '@shared/auth/authAccess'
import {ioComment} from '@shared/schemas/ioComment'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const CommentListOfPostDef = {
  path: '/CommentListOfPost',
  payload: io.object({
    postId: io.string(),
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
  payload: io.object({
    postId: io.string(),
    content: io.string(),
    commentParentId: io.optional(io.string()),
  }),
  result: ioComment,
} satisfies TEndpointDef

export const CommentUpdateDef = {
  access: authPoint.commentWrite,
  path: '/CommentUpdate',
  payload: io.object({
    commentId: io.string(),
    content: io.string(),
  }),
  result: ioComment,
} satisfies TEndpointDef

export const CommentDeleteDef = {
  access: authPoint.commentWrite,
  path: '/CommentDelete',
  payload: io.object({
    commentId: io.string(),
  }),
} satisfies TEndpointDef
