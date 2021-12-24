import {io} from 'torva'
import {ioSeason} from '../schemas/Season'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $SeasonList = createEndpoint({
  path: '/SeasonList',
  payload: io.object({
    search: io.optional(io.string()),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioSeason),
})
/**
 *
 */
export const $SeasonCreate = createEndpoint({
  path: '/SeasonCreate',
  payload: io.object({
    name: io.string(),
    signUpOpen: io.boolean(),
  }),
  result: ioSeason,
})
/**
 *
 */
export const $SeasonUpdate = createEndpoint({
  path: '/SeasonUpdate',
  payload: io.object({
    seasonId: io.string(),
    name: io.string(),
    signUpOpen: io.boolean(),
  }),
  result: ioSeason,
})
