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
): Promise<TMemberImportSummary> => {
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

  const note = notes.join(' ')
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
  const details = visibleRows.map(formatInvalidGamedayRowNote)
  if (hiddenCount > 0) details.push(`${hiddenCount} more row(s)`)
  return `Skipped ${invalidRows.length} invalid GameDay member row(s): ${details.join('; ')}.`
}

const formatInvalidGamedayRowNote = (row: TGamedayInvalidMemberRow): string => {
  return `row ${row.rowNumber} ${row.reasons.join(', ')} (${formatGamedayMemberContext(row.member)})`
}

const formatGamedayMemberContext = (member: TGamedayExportMember): string => {
  return [
    formatGamedayMemberContextValue('team', member.teamName),
    formatGamedayMemberContextValue('first', member.firstName),
    formatGamedayMemberContextValue('last', member.lastName),
    formatGamedayMemberContextValue('email', member.email),
  ].join(', ')
}

const formatGamedayMemberContextValue = (label: string, value: string) => {
  const trimmedValue = value.trim()
  return `${label}: ${trimmedValue ? `"${trimmedValue}"` : '<blank>'}`
}

const formatUnrecognisedGendersNote = (
  unrecognisedGenders: Set<string>,
): string | undefined => {
  if (unrecognisedGenders.size === 0) return undefined
  const values = [...unrecognisedGenders].join(', ')
  const note = `Unrecognised GameDay gender value(s) imported as "other": ${values}.`
  console.warn(note)
  return note
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
