import {io} from 'torva'
import {ioFixture, ioFixtureGame} from '../schemas/ioFixture'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $RoundListOfSeason = createEndpoint({
  path: '/FixtureListOfSeason',
  payload: io.object({
    seasonId: io.string(),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioFixture),
})
/**
 *
 */
export const $RoundCreate = createEndpoint({
  path: '/FixtureCreate',
  payload: io.object({
    seasonId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioFixtureGame),
  }),
  result: ioFixture,
})
/**
 *
 */
export const $RoundUpdate = createEndpoint({
  path: '/FixtureUpdate',
  payload: io.object({
    roundId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioFixtureGame),
  }),
  result: ioFixture,
})
/**
 *
 */
export const $RoundDelete = createEndpoint({
  path: '/FixtureDelete',
  payload: io.object({
    roundId: io.string(),
  }),
})
