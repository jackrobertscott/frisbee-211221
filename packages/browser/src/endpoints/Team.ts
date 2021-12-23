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
    search: io.optional(io.string()),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioTeam),
})
/**
 *
 */
export const $TeamCreate = createEndpoint({
  path: '/TeamCreate',
  payload: io.object({
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
