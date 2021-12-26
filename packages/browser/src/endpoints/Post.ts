import {io} from 'torva'
import {ioPost} from '../schemas/Post'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $PostList = createEndpoint({
  path: '/PostList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioPost),
})
/**
 *
 */
export const $PostCreate = createEndpoint({
  path: '/PostCreate',
  payload: io.object({
    title: io.string(),
    content: io.string(),
  }),
  result: ioPost,
})
/**
 *
 */
export const $PostUpdate = createEndpoint({
  path: '/PostUpdate',
  payload: io.object({
    postId: io.string(),
    title: io.string(),
    content: io.string(),
  }),
  result: ioPost,
})
