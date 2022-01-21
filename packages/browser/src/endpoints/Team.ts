import {io} from 'torva'
import {ioMember} from '../schemas/ioMember'
import {ioTeam} from '../schemas/ioTeam'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $TeamListOfSeason = createEndpoint({
  path: '/TeamListOfSeason',
  payload: io.object({
    seasonId: io.string(),
    search: io.optional(io.string()),
    limit: io.optional(io.number()),
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    teams: io.array(ioTeam),
  }),
})
/**
 *
 */
export const $TeamGetOfSeason = createEndpoint({
  path: '/TeamGetOfSeason',
  payload: io.object({
    seasonId: io.string(),
  }),
  result: ioTeam,
})
/**
 *
 */
export const $TeamCurrentCreate = createEndpoint({
  path: '/TeamCurrentCreate',
  payload: io.object({
    seasonId: io.string(),
    name: io.string(),
    color: io.string(),
  }),
  result: io.object({
    team: ioTeam,
    member: ioMember,
  }),
})
/**
 *
 */
export const $TeamCurrentUpdate = createEndpoint({
  path: '/TeamCurrentUpdate',
  payload: io.object({
    teamId: io.string(),
    name: io.string(),
    color: io.string(),
  }),
  result: ioTeam,
})
/**
 *
 */
export const $TeamCurrentSwitch = createEndpoint({
  path: '/TeamCurrentSwitch',
  payload: io.string(),
})
/**
 *
 */
export const $TeamCreate = createEndpoint({
  path: '/TeamCreate',
  payload: io.object({
    seasonId: io.string(),
    name: io.string(),
    color: io.string(),
  }),
  result: ioTeam,
})
/**
 *
 */
export const $TeamUpdate = createEndpoint({
  path: '/TeamUpdate',
  payload: io.object({
    teamId: io.string(),
    name: io.string(),
    color: io.string(),
  }),
  result: ioTeam,
})
/**
 *
 */
export const $TeamDelete = createEndpoint({
  path: '/TeamDelete',
  payload: io.object({
    teamId: io.string(),
  }),
})
