import {TReport} from '@shared/schemas/ioReport'
import {
  TSeason,
  TSeasonGenderDivision,
} from '@shared/schemas/ioSeason'

export type TMvpGenderSlot = 'male' | 'female'

export type TSeasonMvpFields = Pick<
  Partial<TReport>,
  'mvpMale' | 'mvpMale2' | 'mvpFemale' | 'mvpFemale2'
>

type TSeasonGenderDivisionSource = Pick<TSeason, 'genderDivision'> | undefined

export function getSeasonGenderDivision(
  season: TSeasonGenderDivisionSource,
): TSeasonGenderDivision {
  return season?.genderDivision ?? 'mixed'
}

export function isSeasonMvpSlotEnabled(
  season: TSeasonGenderDivisionSource,
  slot: TMvpGenderSlot,
): boolean {
  const division = getSeasonGenderDivision(season)
  return (
    division === 'mixed' ||
    (division === 'men' && slot === 'male') ||
    (division === 'women' && slot === 'female')
  )
}

export function getSeasonMvpSlots(season: TSeasonGenderDivisionSource): {
  male: boolean
  female: boolean
} {
  return {
    male: isSeasonMvpSlotEnabled(season, 'male'),
    female: isSeasonMvpSlotEnabled(season, 'female'),
  }
}

export function getSeasonMvpFields(
  season: TSeasonGenderDivisionSource,
): Array<keyof TSeasonMvpFields> {
  const slots = getSeasonMvpSlots(season)
  return [
    ...(slots.male ? (['mvpMale', 'mvpMale2'] as const) : []),
    ...(slots.female ? (['mvpFemale', 'mvpFemale2'] as const) : []),
  ]
}

export function sanitizeSeasonMvpFields(
  season: TSeasonGenderDivisionSource,
  fields: TSeasonMvpFields,
): TSeasonMvpFields {
  const slots = getSeasonMvpSlots(season)
  return {
    mvpMale: slots.male ? fields.mvpMale : undefined,
    mvpMale2: slots.male ? fields.mvpMale2 : undefined,
    mvpFemale: slots.female ? fields.mvpFemale : undefined,
    mvpFemale2: slots.female ? fields.mvpFemale2 : undefined,
  }
}

export function isReportMvpCompleteForSeason(
  report: TSeasonMvpFields,
  season: TSeasonGenderDivisionSource,
  useOfficialScoring: boolean | undefined,
): 'complete' | 'partial' | 'empty' {
  const slots = getSeasonMvpSlots(season)
  const primaryFields = [
    ...(slots.male ? [report.mvpMale] : []),
    ...(slots.female ? [report.mvpFemale] : []),
  ]
  const secondaryFields =
    useOfficialScoring === true
      ? [
          ...(slots.male ? [report.mvpMale2] : []),
          ...(slots.female ? [report.mvpFemale2] : []),
        ]
      : []
  const requiredFields = [...primaryFields, ...secondaryFields]
  if (!requiredFields.length) {
    return 'complete'
  }
  if (requiredFields.every(Boolean)) {
    return 'complete'
  }
  if (primaryFields.some(Boolean)) {
    return 'partial'
  }
  return 'empty'
}
