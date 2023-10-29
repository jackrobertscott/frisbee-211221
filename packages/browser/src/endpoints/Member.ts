import {io} from 'torva'
import {ioMember} from '../../../shared/src/schemas/ioMember'
import {ioTeam} from '../../../shared/src/schemas/ioTeam'
import {ioUserPublic} from '../../../shared/src/schemas/ioUser'
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
    current: io.optional(ioMember),
    members: io.array(ioMember),
    users: io.array(ioUserPublic),
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
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    gender: io.optional(io.string()),
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
  result: ioMember,
})
