import {io} from 'torva'
import {ioMember} from '../schemas/Member'
import {ioTeam} from '../schemas/Team'
import {ioUser} from '../schemas/User'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $MemberListOfUser = createEndpoint({
  path: '/MemberListOfUser',
  result: io.object({
    members: io.array(ioMember),
    teams: io.array(ioTeam),
  }),
})
/**
 *
 */
export const $MemberListOfTeam = createEndpoint({
  path: '/MemberListOfTeam',
  payload: io.string(),
  result: io.object({
    current: ioMember,
    members: io.array(ioMember),
    users: io.array(ioUser),
  }),
})
/**
 *
 */
export const $MemberCreate = createEndpoint({
  path: '/MemberCreate',
  payload: io.object({
    teamId: io.string(),
    email: io.string(),
  }),
  result: ioMember,
})
/**
 *
 */
export const $MemberRemove = createEndpoint({
  path: '/MemberRemove',
  payload: io.string(),
})
/**
 *
 */
export const $MemberRequestCreate = createEndpoint({
  path: '/MemberRequestCreate',
  payload: io.string(),
  result: ioMember,
})
/**
 *
 */
export const $MemberAcceptOrDecline = createEndpoint({
  path: '/MemberAcceptOrDecline',
  payload: io.object({
    memberId: io.string(),
    accept: io.boolean(),
  }),
})
/**
 *
 */
export const $MemberSetCaptain = createEndpoint({
  path: '/MemberSetCaptain',
  payload: io.string(),
})
