import {io} from 'torva'
import {ioPost} from '../schemas/ioPost'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $PostListOfSeason = createEndpoint({
  path: '/PostListOfSeason',
  payload: io.object({
    seasonId: io.string(),
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
    seasonId: io.string(),
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
