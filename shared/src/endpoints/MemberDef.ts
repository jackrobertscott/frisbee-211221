import {ioMember} from '@shared/schemas/ioMember'
import {ioTeam} from '@shared/schemas/ioTeam'
import {ioUserGender} from '@shared/schemas/ioUserGender'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const MemberListOfUserDef = {
  path: '/MemberListOfUser',
  result: io.object({
    members: io.array(ioMember),
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const MemberListOfTeamDef = {
  path: '/MemberListOfTeam',
  payload: io.string(),
  result: io.object({
    current: io.optional(ioMember),
    members: io.array(ioMember),
    users: io.array(ioUserPublic),
  }),
} satisfies TEndpointDef

export const MemberCreateDef = {
  path: '/MemberCreate',
  payload: io.object({
    teamId: io.string(),
    email: io.string().email().trim(),
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    gender: io.optional(ioUserGender),
  }),
  result: ioMember,
} satisfies TEndpointDef

export const MemberRemoveDef = {
  path: '/MemberRemove',
  payload: io.string(),
} satisfies TEndpointDef

export const MemberRequestCreateDef = {
  path: '/MemberRequestCreate',
  payload: io.string(),
  result: ioMember,
} satisfies TEndpointDef

export const MemberAcceptOrDeclineDef = {
  path: '/MemberAcceptOrDecline',
  payload: io.object({
    memberId: io.string(),
    accept: io.boolean(),
  }),
} satisfies TEndpointDef

export const MemberSetCaptainDef = {
  path: '/MemberSetCaptain',
  payload: io.string(),
  result: ioMember,
} satisfies TEndpointDef
