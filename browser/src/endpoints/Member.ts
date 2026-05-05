import {
  MemberAcceptOrDeclineDef,
  MemberCreateDef,
  MemberListOfTeamDef,
  MemberLookupByEmailDef,
  MemberRemoveDef,
  MemberRequestCreateDef,
  MemberSetCaptainDef,
} from '@shared/endpoints/MemberDef'
import {createEndpoint} from '../utils/endpoints'

export const $MemberListOfTeam = createEndpoint(MemberListOfTeamDef)

export const $MemberCreate = createEndpoint(MemberCreateDef)

export const $MemberLookupByEmail = createEndpoint(MemberLookupByEmailDef)

export const $MemberRemove = createEndpoint(MemberRemoveDef)

export const $MemberRequestCreate = createEndpoint(MemberRequestCreateDef)

export const $MemberAcceptOrDecline = createEndpoint(MemberAcceptOrDeclineDef)

export const $MemberSetCaptain = createEndpoint(MemberSetCaptainDef)
