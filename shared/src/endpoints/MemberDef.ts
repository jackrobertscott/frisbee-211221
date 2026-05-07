import {authPoint} from '@shared/auth/authAccess'
import {ioMember} from '@shared/schemas/ioMember'
import {ioUser, ioUserEmail, ioUserPublic} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const MemberListOfTeamDef = {
  access: authPoint.memberRead,
  path: '/MemberListOfTeam',
  payload: ioMember.shape.teamId,
  result: io.object({
    current: io.optional(ioMember),
    members: io.array(ioMember),
    users: io.array(ioUserPublic),
  }),
} satisfies TEndpointDef

export const MemberCreateDef = {
  access: authPoint.memberManage,
  path: '/MemberCreate',
  payload: io.object({
    teamId: ioMember.shape.teamId,
    email: ioUserEmail.shape.value,
    firstName: io.optional(ioUser.shape.firstName),
    lastName: io.optional(ioUser.shape.lastName),
    gender: io.optional(ioUser.shape.gender),
  }),
  result: ioMember,
} satisfies TEndpointDef

export const MemberLookupByEmailDef = {
  access: authPoint.memberManage,
  path: '/MemberLookupByEmail',
  payload: io.object({
    teamId: ioMember.shape.teamId,
    email: ioUserEmail.shape.value,
  }),
  result: io.object({
    exists: io.boolean(),
    user: io.optional(ioUserPublic),
  }),
} satisfies TEndpointDef

export const MemberRemoveDef = {
  access: authPoint.memberManage,
  path: '/MemberRemove',
  payload: ioMember.shape.id,
} satisfies TEndpointDef

export const MemberRequestCreateDef = {
  access: authPoint.teamJoin,
  path: '/MemberRequestCreate',
  payload: ioMember.shape.teamId,
  result: ioMember,
} satisfies TEndpointDef

export const MemberAcceptOrDeclineDef = {
  access: authPoint.memberManage,
  path: '/MemberAcceptOrDecline',
  payload: io.object({
    memberId: ioMember.shape.id,
    accept: io.boolean(),
  }),
} satisfies TEndpointDef

export const MemberSetCaptainDef = {
  access: authPoint.memberManage,
  path: '/MemberSetCaptain',
  payload: ioMember.shape.id,
  result: ioMember,
} satisfies TEndpointDef
