import {io} from 'torva'
import {ioMember} from '../schemas/Member'
import {ioTeam} from '../schemas/Team'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $TeamList = createEndpoint({
  path: '/TeamList',
  payload: io.object({
    seasonId: io.string(),
    search: io.optional(io.string()),
  }),
  result: io.array(ioTeam),
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
export const $TeamCreate = createEndpoint({
  path: '/TeamCreate',
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
export const $TeamSwitch = createEndpoint({
  path: '/TeamSwitch',
  payload: io.string(),
})
