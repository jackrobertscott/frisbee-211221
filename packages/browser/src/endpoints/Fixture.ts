import {io} from 'torva'
import {ioRound, ioRoundGame} from '../schemas/Fixture'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $RoundListOfSeason = createEndpoint({
  path: '/RoundListOfSeason',
  payload: io.object({
    seasonId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioRound),
})
/**
 *
 */
export const $RoundCreate = createEndpoint({
  path: '/RoundCreate',
  payload: io.object({
    seasonId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioRoundGame),
  }),
  result: ioRound,
})
/**
 *
 */
export const $RoundUpdate = createEndpoint({
  path: '/RoundUpdate',
  payload: io.object({
    roundId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioRoundGame),
  }),
  result: ioRound,
})
/**
 *
 */
export const $RoundDelete = createEndpoint({
  path: '/RoundDelete',
  payload: io.object({
    roundId: io.string(),
  }),
})
