/* Pure score-report form logic (validation, payloads, MVP slot rules). */
import {
  TReportCreatePayload,
  TReportUpdatePayload,
} from '@shared/endpoints/ReportDef'
import {TFeatureAgainstOption} from '@shared/endpoints/FeatureDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TSeason} from '@shared/schemas/ioSeason'
import {TUserPublic} from '@shared/schemas/ioUser'
import {exactShape} from '@shared/utils/endpointDef'
import {validateOfficialSpiritComment} from '@shared/utils/reportValidation'
import {
  getSeasonMvpSlots,
  isSeasonMvpSlotEnabled,
  isUserEligibleForMvpSlot,
  sanitizeSeasonMvpFields,
  TMvpGenderSlot,
} from '@shared/utils/seasonGenderDivision'
import {SPIRIT_DEFAULT_SCORE} from './spirit'

export type ReportFormData = {
  teamId: undefined | string
  againstTeamId: undefined | string
  fixtureId: undefined | string
  scoreFor: undefined | number
  scoreAgainst: undefined | number
  mvpMale: undefined | string
  mvpFemale: undefined | string
  mvpMale2?: undefined | string
  mvpFemale2?: undefined | string
  spirit: undefined | number
  spiritComment: string
  spiritP1?: undefined | number
  spiritP2?: undefined | number
  spiritP3?: undefined | number
  spiritP4?: undefined | number
  spiritP5?: undefined | number
}

export type ReportAgainstOption = TFeatureAgainstOption
export type ReportMvpField = 'mvpMale' | 'mvpFemale' | 'mvpMale2' | 'mvpFemale2'
export type ReportSpiritField =
  | 'spiritP1'
  | 'spiritP2'
  | 'spiritP3'
  | 'spiritP4'
  | 'spiritP5'

export const SPIRIT_FIELDS: ReportSpiritField[] = [
  'spiritP1',
  'spiritP2',
  'spiritP3',
  'spiritP4',
  'spiritP5',
]

export const SPIRIT_GRID_URL =
  'https://d36m266ykvepgv.cloudfront.net/uploads/media/aTYVA2eazu/o/sotg-scoring-system-template-2019.pdf'

const REPORT_FORM_DEFAULTS: ReportFormData = {
  teamId: undefined,
  againstTeamId: undefined,
  fixtureId: undefined,
  scoreFor: undefined,
  scoreAgainst: undefined,
  mvpMale: undefined,
  mvpFemale: undefined,
  mvpMale2: undefined,
  mvpFemale2: undefined,
  spirit: SPIRIT_DEFAULT_SCORE,
  spiritComment: '',
  spiritP1: SPIRIT_DEFAULT_SCORE,
  spiritP2: SPIRIT_DEFAULT_SCORE,
  spiritP3: SPIRIT_DEFAULT_SCORE,
  spiritP4: SPIRIT_DEFAULT_SCORE,
  spiritP5: SPIRIT_DEFAULT_SCORE,
}

export const createReportFormData = (
  overrides: Partial<ReportFormData> = {},
): ReportFormData => ({...REPORT_FORM_DEFAULTS, ...overrides})

export const createReportFormDataFromReport = (
  report?: Partial<TReport>,
): ReportFormData =>
  createReportFormData({
    teamId: report?.teamId,
    againstTeamId: report?.teamAgainstId,
    fixtureId: report?.fixtureId,
    scoreFor: report?.scoreFor,
    scoreAgainst: report?.scoreAgainst,
    mvpMale: report?.mvpMale,
    mvpFemale: report?.mvpFemale,
    mvpMale2: report?.mvpMale2,
    mvpFemale2: report?.mvpFemale2,
    spirit: report?.spirit ?? SPIRIT_DEFAULT_SCORE,
    spiritComment: report?.spiritComment ?? '',
    spiritP1: report?.spiritP1 ?? SPIRIT_DEFAULT_SCORE,
    spiritP2: report?.spiritP2 ?? SPIRIT_DEFAULT_SCORE,
    spiritP3: report?.spiritP3 ?? SPIRIT_DEFAULT_SCORE,
    spiritP4: report?.spiritP4 ?? SPIRIT_DEFAULT_SCORE,
    spiritP5: report?.spiritP5 ?? SPIRIT_DEFAULT_SCORE,
  })

/** Most recent fixture whose date has already passed (the default to report on). */
export function getLatestPastFixtureId(fixtures: TFixture[] | undefined) {
  if (!fixtures?.length) return undefined
  const now = Date.now()
  let fixtureId: string | undefined
  let fixtureTime = -Infinity
  for (const fixture of fixtures) {
    const time = new Date(fixture.date).valueOf()
    if (!Number.isFinite(time) || time > now) continue
    if (time >= fixtureTime) {
      fixtureTime = time
      fixtureId = fixture.id
    }
  }
  return fixtureId
}

export function createReportCreatePayload(
  formData: ReportFormData,
  season?: TSeason,
): TReportCreatePayload | undefined {
  const {teamId, againstTeamId, fixtureId, scoreFor, scoreAgainst} = formData
  if (
    !teamId ||
    !againstTeamId ||
    !fixtureId ||
    scoreFor === undefined ||
    scoreAgainst === undefined
  ) {
    return undefined
  }
  const mvps = sanitizeSeasonMvpFields(season, formData)
  return exactShape<TReportCreatePayload>()({
    teamId,
    teamAgainstId: againstTeamId,
    fixtureId,
    scoreFor,
    scoreAgainst,
    mvpMale: mvps.mvpMale,
    mvpFemale: mvps.mvpFemale,
    mvpMale2: mvps.mvpMale2,
    mvpFemale2: mvps.mvpFemale2,
    spirit: formData.spirit,
    spiritComment: formData.spiritComment,
    spiritP1: formData.spiritP1,
    spiritP2: formData.spiritP2,
    spiritP3: formData.spiritP3,
    spiritP4: formData.spiritP4,
    spiritP5: formData.spiritP5,
  })
}

export function createReportUpdatePayload(
  reportId: string,
  formData: ReportFormData,
  season?: TSeason,
): TReportUpdatePayload | undefined {
  const {scoreFor, scoreAgainst} = formData
  if (scoreFor === undefined || scoreAgainst === undefined) return undefined
  const mvps = sanitizeSeasonMvpFields(season, formData)
  // empty slots are sent as null so the server clears them
  return exactShape<TReportUpdatePayload>()({
    reportId,
    scoreFor,
    scoreAgainst,
    mvpMale: mvps.mvpMale ?? null,
    mvpFemale: mvps.mvpFemale ?? null,
    mvpMale2: mvps.mvpMale2 ?? null,
    mvpFemale2: mvps.mvpFemale2 ?? null,
    spirit: formData.spirit,
    spiritComment: formData.spiritComment,
    spiritP1: formData.spiritP1,
    spiritP2: formData.spiritP2,
    spiritP3: formData.spiritP3,
    spiritP4: formData.spiritP4,
    spiritP5: formData.spiritP5,
  })
}

const slotOfField = (field: ReportMvpField): TMvpGenderSlot =>
  field === 'mvpMale' || field === 'mvpMale2' ? 'male' : 'female'

/**
 * Drops MVP picks that are no longer valid: disabled slots for the season's
 * gender division, players not in the opposition, ineligible genders and
 * duplicate 1st/2nd picks.
 */
export function sanitizeReportFormMvps(
  formData: Pick<ReportFormData, ReportMvpField>,
  users: TUserPublic[] | undefined,
  season?: TSeason,
): Pick<ReportFormData, ReportMvpField> {
  if (users === undefined) {
    const mvps = sanitizeSeasonMvpFields(season, formData)
    return {
      mvpMale: mvps.mvpMale,
      mvpFemale: mvps.mvpFemale,
      mvpMale2: mvps.mvpMale2,
      mvpFemale2: mvps.mvpFemale2,
    }
  }
  const slots = getSeasonMvpSlots(season)
  const usersById = new Map(users.map((user) => [user.id, user]))
  const valid = (field: ReportMvpField, userId: string | undefined) => {
    if (!userId) return undefined
    const user = usersById.get(userId)
    if (!user) return undefined
    const slot = slotOfField(field)
    if (!isSeasonMvpSlotEnabled(season, slot)) return undefined
    return isUserEligibleForMvpSlot(user, slot) ? userId : undefined
  }
  const next = {
    mvpMale: slots.male ? valid('mvpMale', formData.mvpMale) : undefined,
    mvpFemale: slots.female ? valid('mvpFemale', formData.mvpFemale) : undefined,
    mvpMale2: slots.male ? valid('mvpMale2', formData.mvpMale2) : undefined,
    mvpFemale2: slots.female
      ? valid('mvpFemale2', formData.mvpFemale2)
      : undefined,
  }
  if (next.mvpMale && next.mvpMale === next.mvpMale2) next.mvpMale2 = undefined
  if (next.mvpFemale && next.mvpFemale === next.mvpFemale2)
    next.mvpFemale2 = undefined
  return next
}

export const sameMvps = (
  a: Pick<ReportFormData, ReportMvpField>,
  b: Pick<ReportFormData, ReportMvpField>,
) =>
  a.mvpMale === b.mvpMale &&
  a.mvpFemale === b.mvpFemale &&
  a.mvpMale2 === b.mvpMale2 &&
  a.mvpFemale2 === b.mvpFemale2

export type ReportMvpSlot = {
  field: ReportMvpField
  /** The paired 1st/2nd field that can't hold the same player. */
  pair: ReportMvpField
  slot: TMvpGenderSlot
  label: string
}

/** MVP inputs to show for the season's gender division and scoring system. */
export function getReportMvpSlots(
  season: TSeason | undefined,
  useOfficialScoring: boolean,
): ReportMvpSlot[] {
  const slots = getSeasonMvpSlots(season)
  const n = useOfficialScoring ? ' 1' : ''
  return [
    ...(slots.male
      ? [
          {field: 'mvpMale', pair: 'mvpMale2', slot: 'male', label: `MVP Male${n}`} as const,
          ...(useOfficialScoring
            ? [{field: 'mvpMale2', pair: 'mvpMale', slot: 'male', label: 'MVP Male 2'} as const]
            : []),
        ]
      : []),
    ...(slots.female
      ? [
          {field: 'mvpFemale', pair: 'mvpFemale2', slot: 'female', label: `MVP Female${n}`} as const,
          ...(useOfficialScoring
            ? [{field: 'mvpFemale2', pair: 'mvpFemale', slot: 'female', label: 'MVP Female 2'} as const]
            : []),
        ]
      : []),
  ]
}

/** Opposition players eligible for an MVP slot, minus the player picked in its paired slot. */
export const eligibleMvpUsers = (
  users: TUserPublic[],
  slot: TMvpGenderSlot,
  excludedUserId?: string,
) =>
  users
    .filter((user) => isUserEligibleForMvpSlot(user, slot))
    .filter((user) => user.id !== excludedUserId)

export function validateReportForm(
  formData: ReportFormData,
  useOfficialScoring?: boolean,
  season?: TSeason,
): string | undefined {
  if (!formData.fixtureId) return 'Fixture is required.'
  if (!formData.teamId) return 'Team is required.'
  if (!formData.againstTeamId) return 'Opposition team is required.'
  if (formData.scoreFor === undefined || formData.scoreAgainst === undefined)
    return 'Both scores are required.'

  const slots = getSeasonMvpSlots(season)
  const both = slots.male && slots.female
  const {mvpMale, mvpFemale, mvpMale2, mvpFemale2} = formData

  if (both && mvpMale && mvpMale === mvpFemale)
    return 'The male and female MVP cannot be the same person.'

  if (useOfficialScoring) {
    if (slots.male && mvpMale && mvpMale === mvpMale2)
      return 'The 5-point and 3-point male MVPs cannot be the same person.'
    if (slots.female && mvpFemale && mvpFemale === mvpFemale2)
      return 'The 5-point and 3-point female MVPs cannot be the same person.'
    if (both && mvpMale2 && mvpMale2 === mvpFemale2)
      return 'The 3-point male and female MVPs cannot be the same person.'
    if (both && mvpMale && mvpMale === mvpFemale2)
      return 'The 5-point male MVP and 3-point female MVP cannot be the same person.'
    if (both && mvpFemale && mvpFemale === mvpMale2)
      return 'The 5-point female MVP and 3-point male MVP cannot be the same person.'
    if (SPIRIT_FIELDS.some((field) => formData[field] === undefined))
      return 'All five spirit categories must be rated for official scoring.'
    const commentError = validateOfficialSpiritComment(formData)
    if (commentError) return commentError
  } else if (formData.spirit === undefined) {
    return 'Spirit score is required.'
  }
  return undefined
}

/** Spirit total shown in tables: the five categories when official, else the single score. */
export const reportSpiritTotal = (
  report: Pick<TReport, 'spirit' | ReportSpiritField>,
  useOfficialScoring: boolean | undefined,
) =>
  useOfficialScoring
    ? SPIRIT_FIELDS.reduce((sum, field) => sum + (report[field] ?? 0), 0)
    : (report.spirit ?? 0)

export function shuffleArray<T>(array: T[]): T[] {
  const next = [...array]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}
