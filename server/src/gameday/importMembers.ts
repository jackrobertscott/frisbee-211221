import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {normalizeUserGender} from '@shared/schemas/ioUserGender'
import type {TUserGender} from '@shared/schemas/ioUserGender'
import {$GamedayImportRun} from '../tables/$GamedayImportRun'
import {
  importMemberObjects,
  TMemberImportSummary,
} from '../services/importMemberObjects'
import {decryptGamedayPassword} from './credentials'
import {runGamedayExportProcess} from './runExportProcess'
import type {TGamedayExportMember} from './types'

const GAMEDAY_STARTING_URL = 'https://membership.mygameday.app/'
const MAX_GAMEDAY_INVALID_ROW_NOTE_DETAILS = 25

export type TGamedayImportTrigger = 'manual' | 'scheduled'

interface TGamedayImportSummary extends TMemberImportSummary {
  note?: string
}

interface TGamedayPreparedImport {
  objects: Record<string, string>[]
  note?: string
}

interface TGamedayInvalidMemberRow {
  rowNumber: number
  reasons: string[]
  member: TGamedayExportMember
}

export const runGamedayImportWithHistory = async (
  config: TGamedayImportConfig,
  trigger: TGamedayImportTrigger,
): Promise<TGamedayImportSummary> => {
  const now = new Date().toISOString()
  const run = await $GamedayImportRun.createOne({
    configId: config.id,
    seasonId: config.seasonId,
    trigger,
    status: 'running',
    association: config.association,
    competition: config.competition,
    startedOn: now,
  })

  try {
    const summary = await runGamedayImport(config)
    await $GamedayImportRun.updateOne(
      {id: run.id},
      {
        status: 'succeeded',
        finishedOn: new Date().toISOString(),
        rowsImported: summary.rowsImported,
        teamsCreated: summary.teamsCreated,
        usersCreated: summary.usersCreated,
        membersCreated: summary.membersCreated,
        note: summary.note,
      },
    )
    return summary
  } catch (error) {
    await $GamedayImportRun.updateOne(
      {id: run.id},
      {
        status: 'failed',
        finishedOn: new Date().toISOString(),
        errorMessage: formatErrorMessage(error),
      },
    )
    throw error
  }
}

const runGamedayImport = async (
  config: TGamedayImportConfig,
): Promise<TGamedayImportSummary> => {
  const result = await runGamedayExportProcess({
    startingUrl: GAMEDAY_STARTING_URL,
    username: config.username,
    password: decryptGamedayPassword(config.passwordEncrypted),
    association: config.association,
    competition: config.competition,
  })
  const prepared = prepareGamedayImport(result.members)
  const summary = await importMemberObjects(prepared.objects, config.seasonId)
  return {
    ...summary,
    note: prepared.note,
  }
}

const prepareGamedayImport = (
  members: TGamedayExportMember[],
): TGamedayPreparedImport => {
  const unrecognisedGenders = new Set<string>()
  const invalidRows: TGamedayInvalidMemberRow[] = []
  const objects: Record<string, string>[] = []

  members.forEach((member, index) => {
    const reasons = readInvalidGamedayMemberReasons(member)
    if (reasons.length) {
      invalidRows.push({
        rowNumber: index + 2,
        reasons,
        member,
      })
      return
    }

    objects.push({
      team_name: member.teamName,
      email_address: member.email,
      first_name: member.firstName,
      last_name: member.lastName,
      gender: normalizeGamedayGender(member.gender, unrecognisedGenders),
    })
  })

  const notes = [
    formatInvalidGamedayRowsNote(invalidRows),
    formatUnrecognisedGendersNote(unrecognisedGenders),
  ].filter((note): note is string => Boolean(note))

  const note = notes.join('\n\n')
  return {
    objects,
    note: note || undefined,
  }
}

const readInvalidGamedayMemberReasons = (
  member: TGamedayExportMember,
): string[] => {
  const reasons: string[] = []
  if (!member.teamName.trim()) reasons.push('missing team name')
  if (!member.firstName.trim()) reasons.push('missing first name')
  if (!member.lastName.trim()) reasons.push('missing last name')
  return reasons
}

const formatInvalidGamedayRowsNote = (
  invalidRows: TGamedayInvalidMemberRow[],
): string | undefined => {
  if (!invalidRows.length) return undefined
  const visibleRows = invalidRows.slice(0, MAX_GAMEDAY_INVALID_ROW_NOTE_DETAILS)
  const hiddenCount = invalidRows.length - visibleRows.length
  const lines = [
    `Skipped ${formatCount(
      invalidRows.length,
      'invalid GameDay member row',
      'invalid GameDay member rows',
    )}.`,
    '',
    'Rows skipped:',
    ...visibleRows.map(formatInvalidGamedayRowNote),
  ]
  if (hiddenCount > 0) {
    lines.push(
      `- ${formatCount(hiddenCount, 'additional row', 'additional rows')} omitted from this note.`,
    )
  }
  return lines.join('\n')
}

const formatInvalidGamedayRowNote = (row: TGamedayInvalidMemberRow): string => {
  const problemLabel = row.reasons.length === 1 ? 'Problem' : 'Problems'
  return [
    `- Row ${row.rowNumber}`,
    `  ${problemLabel}: ${row.reasons.join('; ')}`,
    formatGamedayMemberContext(row.member),
  ].join('\n')
}

const formatGamedayMemberContext = (member: TGamedayExportMember): string => {
  return [
    formatGamedayMemberContextValue('Team', member.teamName),
    formatGamedayMemberContextValue('First', member.firstName),
    formatGamedayMemberContextValue('Last', member.lastName),
    formatGamedayMemberContextValue('Email', member.email),
  ].join('\n')
}

const formatGamedayMemberContextValue = (
  label: string,
  value: string,
): string => {
  const trimmedValue = value.trim()
  const displayValue = trimmedValue ? `"${trimmedValue}"` : '<blank>'
  return `  ${label}: ${displayValue}`
}

const formatUnrecognisedGendersNote = (
  unrecognisedGenders: Set<string>,
): string | undefined => {
  if (unrecognisedGenders.size === 0) return undefined
  const values = [...unrecognisedGenders].sort()
  const note = [
    `Imported ${formatCount(
      values.length,
      'unrecognised GameDay gender value',
      'unrecognised GameDay gender values',
    )} as "other":`,
    ...values.map((value) => `- "${value}"`),
  ].join('\n')
  console.warn(note)
  return note
}

const formatCount = (
  count: number,
  singular: string,
  plural: string,
): string => {
  return `${count} ${count === 1 ? singular : plural}`
}

const normalizeGamedayGender = (
  value: string,
  unrecognisedValues: Set<string>,
): TUserGender => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return 'other'
  const normalizedGender = normalizeUserGender(trimmedValue)
  if (normalizedGender) return normalizedGender
  unrecognisedValues.add(trimmedValue)
  return 'other'
}

const formatErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return String(error)
}
