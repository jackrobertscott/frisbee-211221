import {io, TypeIoValue} from '@shared/torva'

export const ioSeasonFinalResult = io.object({
  teamId: io.id(),
  position: io.optional(io.null(io.number())),
})

export const ioSeason = io.object({
  id: io.id(),
  createdOn: io.date(),
  updatedOn: io.date(),
  name: io.string(),
  signUpOpen: io.boolean(),
  isHidden: io.optional(io.boolean()),
  useOfficialScoring: io.optional(io.boolean()),
  finalResults: io.optional(io.array(ioSeasonFinalResult)),
})

export type TSeason = TypeIoValue<typeof ioSeason>
