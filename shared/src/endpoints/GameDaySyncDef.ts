import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

export const GameDaySyncManualDef = {
  path: '/GameDaySyncManual',
  payload: io.object({}),
  result: io.array(
    io.object({
      success: io.boolean(),
      message: io.string(),
      stats: io.object({
        usersProcessed: io.number(),
        usersCreated: io.number(),
        usersUpdated: io.number(),
        teamsProcessed: io.number(),
        teamsCreated: io.number(),
        teamsUpdated: io.number(),
        membersCreated: io.number(),
        membersUpdated: io.number(),
        membersRemoved: io.number(),
      }),
      error: io.optional(io.string()),
    })
  ),
} satisfies TEndpointDef

export const GameDaySyncSeasonDef = {
  path: '/GameDaySyncSeason',
  payload: io.object({
    seasonId: io.string(),
  }),
  result: io.object({
    success: io.boolean(),
    message: io.string(),
    stats: io.object({
      usersProcessed: io.number(),
      usersCreated: io.number(),
      usersUpdated: io.number(),
      teamsProcessed: io.number(),
      teamsCreated: io.number(),
      teamsUpdated: io.number(),
      membersCreated: io.number(),
      membersUpdated: io.number(),
      membersRemoved: io.number(),
    }),
    error: io.optional(io.string()),
  }),
} satisfies TEndpointDef

export const GameDayConfigUpdateDef = {
  path: '/GameDayConfigUpdate',
  payload: io.object({
    seasonId: io.string(),
    enabled: io.boolean(),
    gamedayLeagueId: io.optional(io.string()),
    gamedaySeasonId: io.optional(io.string()),
  }),
  result: io.object({
    success: io.boolean(),
    message: io.string(),
  }),
} satisfies TEndpointDef