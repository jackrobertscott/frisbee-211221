import {authPoint} from '@shared/auth/authAccess'
import {ioMember} from '@shared/schemas/ioMember'
import {ioTeam} from '@shared/schemas/ioTeam'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const TEAM_LIST_SORT_KEYS = [
  'name',
  'division',
  'phone',
  'email',
  'createdOn',
] as const

export type TTeamListSortKey = (typeof TEAM_LIST_SORT_KEYS)[number]

export const TEAM_LIST_SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TTeamListSortDirection =
  (typeof TEAM_LIST_SORT_DIRECTIONS)[number]

export const TeamCurrentCreateDef = {
  access: authPoint.teamJoin,
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
} satisfies TEndpointDef

export const TeamCurrentUpdateDef = {
  access: authPoint.teamManage,
  path: '/TeamCurrentUpdate',
  payload: io.object({
    teamId: io.string(),
    name: io.string(),
    color: io.string(),
    phone: io.optional(io.string().emptyok()),
    email: io.optional(io.string().emptyok()),
  }),
  result: ioTeam,
} satisfies TEndpointDef

export const TeamCreateDef = {
  access: authPoint.teamAdmin,
  path: '/TeamCreate',
  payload: io.object({
    seasonId: io.string(),
    name: io.string(),
    color: io.string(),
    phone: io.optional(io.string().emptyok()),
    email: io.optional(io.string().emptyok()),
  }),
  result: ioTeam,
} satisfies TEndpointDef

export const TeamUpdateDef = {
  access: authPoint.teamAdmin,
  path: '/TeamUpdate',
  payload: io.object({
    teamId: io.string(),
    name: io.string(),
    color: io.string(),
    phone: io.optional(io.string().emptyok()),
    email: io.optional(io.string().emptyok()),
    division: io.optional(io.number()),
  }),
  result: ioTeam,
} satisfies TEndpointDef

export const TeamDeleteDef = {
  access: authPoint.teamAdmin,
  path: '/TeamDelete',
  payload: io.object({
    teamId: io.string(),
  }),
} satisfies TEndpointDef
