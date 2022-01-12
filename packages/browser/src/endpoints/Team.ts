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
export const $TeamCreateCurrent = createEndpoint({
  path: '/TeamCreateCurrent',
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
export const $TeamUpdateCurrent = createEndpoint({
  path: '/TeamUpdateCurrent',
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
export const $TeamSwitch = createEndpoint({
  path: '/TeamSwitch',
  payload: io.string(),
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
export const $TeamCreate = createEndpoint({
  path: '/TeamCreate',
  payload: io.object({
    seasonId: io.string(),
    name: io.string(),
    color: io.string(),
  }),
  result: ioTeam,
})
