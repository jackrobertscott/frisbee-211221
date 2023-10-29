import {io} from 'torva'
import {ioComment} from '../../../shared/src/schemas/ioComment'
import {ioUserPublic} from '../../../shared/src/schemas/ioUser'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $CommentListOfPost = createEndpoint({
  path: '/CommentListOfPost',
  payload: io.object({
    postId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.object({
    comments: io.array(ioComment),
    users: io.array(ioUserPublic),
  }),
})
/**
 *
 */
export const $CommentCreate = createEndpoint({
  path: '/CommentCreate',
  payload: io.object({
    postId: io.string(),
    content: io.string(),
    commentParentId: io.optional(io.string()),
  }),
  result: ioComment,
})
/**
 *
 */
export const $CommentUpdate = createEndpoint({
  path: '/CommentUpdate',
  payload: io.object({
    commentId: io.string(),
    content: io.string(),
  }),
  result: ioComment,
})
/**
 *
 */
export const $CommentDelete = createEndpoint({
  path: '/CommentDelete',
  payload: io.object({
    commentId: io.string(),
  }),
})
