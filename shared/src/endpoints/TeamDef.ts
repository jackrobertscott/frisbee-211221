import {ioMember} from '@shared/schemas/ioMember'
import {ioTeam} from '@shared/schemas/ioTeam'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const TeamListOfSeasonDef = {
  path: '/TeamListOfSeason',
  payload: io.object({
    seasonId: io.string(),
    search: io.optional(io.string().emptyok()),
    limit: io.optional(io.number()),
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const TeamCurrentCreateDef = {
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
  path: '/TeamDelete',
  payload: io.object({
    teamId: io.string(),
  }),
} satisfies TEndpointDef
