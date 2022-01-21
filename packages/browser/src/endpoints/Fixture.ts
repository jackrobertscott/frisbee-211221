import {io} from 'torva'
import {ioFixture, ioFixtureGame} from '../schemas/ioFixture'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $FixtureListOfSeason = createEndpoint({
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
export const $FixtureCreate = createEndpoint({
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
export const $FixtureUpdate = createEndpoint({
  path: '/FixtureUpdate',
  payload: io.object({
    fixtureId: io.string(),
    title: io.string(),
    date: io.date(),
    games: io.array(ioFixtureGame),
  }),
  result: ioFixture,
})
/**
 *
 */
export const $FixtureDelete = createEndpoint({
  path: '/FixtureDelete',
  payload: io.object({
    fixtureId: io.string(),
  }),
})
