import {io, TypeIoValue} from '@shared/torva'

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
      }),
    ),
  ),
})

export type TSeason = TypeIoValue<typeof ioSeason>
