import {io} from 'torva'
import {ioPost} from '../schemas/ioPost'
import {ioUserPublic} from '../schemas/ioUser'
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
  result: io.object({
    posts: io.array(ioPost),
    users: io.array(ioUserPublic),
  }),
})
/**
 *
 */
export const $PostCreate = createEndpoint({
  path: '/PostCreate',
  payload: io.object({
    seasonId: io.optional(io.string()),
    title: io.string(),
    content: io.string(),
    sendEmail: io.optional(io.boolean()),
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
/**
 *
 */
export const $PostDelete = createEndpoint({
  path: '/PostDelete',
  payload: io.object({
    postId: io.string(),
  }),
})
