import {io, TypeIoValue} from 'torva'
/**
 *
 */
export const ioSeason = io.object({
  id: io.string(),
  createdOn: io.date(),
  updatedOn: io.date(),
  name: io.string(),
  signUpOpen: io.boolean(),
  isHidden: io.optional(io.boolean()),
  useOfficialScoring: io.optional(io.boolean()),
  finalResults: io.optional(
    io.array(
      io.object({
        teamId: io.string(),
        position: io.optional(io.null(io.number())),
      })
    )
  ),
  gamedaySync: io.optional(
    io.object({
      enabled: io.boolean(),
      gamedayLeagueId: io.optional(io.string()),
      gamedaySeasonId: io.optional(io.string()),
      lastSyncDate: io.optional(io.date()),
      syncStatus: io.optional(io.string()),
      syncErrorMessage: io.optional(io.string()),
    })
  ),
})
/**
 *
 */
export type TSeason = TypeIoValue<typeof ioSeason>
