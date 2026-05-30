import {io, TypeIoValue} from '@shared/torva'

export const SEASON_GENDER_DIVISIONS = ['mixed', 'men', 'women'] as const

export type TSeasonGenderDivision = (typeof SEASON_GENDER_DIVISIONS)[number]

export function isSeasonGenderDivision(
  value: string,
): value is TSeasonGenderDivision {
  return SEASON_GENDER_DIVISIONS.some((division) => division === value)
}

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
  genderDivision: io.optional(io.enum([...SEASON_GENDER_DIVISIONS])),
  finalResults: io.optional(io.array(ioSeasonFinalResult)),
})

export type TSeason = TypeIoValue<typeof ioSeason>
