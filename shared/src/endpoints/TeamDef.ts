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

export type TTeamListSortDirection = (typeof TEAM_LIST_SORT_DIRECTIONS)[number]

export const TeamCurrentCreateDef = {
  access: authPoint.teamJoin,
  path: '/TeamCurrentCreate',
  payload: ioTeam.pick(['seasonId', 'name', 'color']),
  result: io.object({
    team: ioTeam,
    member: ioMember,
  }),
} satisfies TEndpointDef

export const TeamCurrentUpdateDef = {
  access: authPoint.teamManage,
  path: '/TeamCurrentUpdate',
  payload: ioTeam
    .pick(['name', 'color', 'phone', 'email'])
    .extend({teamId: ioTeam.shape.id}),
  result: ioTeam,
} satisfies TEndpointDef

export const TeamCreateDef = {
  access: authPoint.teamDirectoryManage,
  path: '/TeamCreate',
  payload: ioTeam.pick(['seasonId', 'name', 'color', 'phone', 'email']),
  result: ioTeam,
} satisfies TEndpointDef

export const TeamUpdateDef = {
  access: authPoint.teamDirectoryManage,
  path: '/TeamUpdate',
  payload: ioTeam
    .pick(['name', 'color', 'phone', 'email', 'division'])
    .extend({teamId: ioTeam.shape.id}),
  result: ioTeam,
} satisfies TEndpointDef

export const TeamDeleteDef = {
  access: authPoint.teamDirectoryManage,
  path: '/TeamDelete',
  payload: io.object({
    teamId: ioTeam.shape.id,
  }),
} satisfies TEndpointDef
