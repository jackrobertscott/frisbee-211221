import {io} from 'torva'
import {ioFixture, ioFixtureGame} from '../../../shared/src/schemas/ioFixture'
import {ioTeam} from '../../../shared/src/schemas/ioTeam'
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
export const $FixtureGet = createEndpoint({
  path: '/FixtureGet',
  payload: io.object({
    fixtureId: io.string(),
  }),
  result: io.object({
    fixture: ioFixture,
    teams: io.array(ioTeam),
  }),
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
    grading: io.optional(io.boolean()),
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
    grading: io.optional(io.boolean()),
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
/**
 *
 */
export const $FixtureSnapshot = createEndpoint({
  path: '/FixtureSnapshot',
  payload: io.object({
    fixtureId: io.string(),
  }),
})
