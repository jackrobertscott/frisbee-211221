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

const GAMEDAY_STARTING_URL = 'https://membership.mygameday.app/'

export type TGamedayImportTrigger = 'manual' | 'scheduled'

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
): Promise<TMemberImportSummary> => {
  const result = await runGamedayExportProcess({
    startingUrl: GAMEDAY_STARTING_URL,
    username: config.username,
    password: decryptGamedayPassword(config.passwordEncrypted),
    association: config.association,
    competition: config.competition,
  })
  const unrecognisedGenders = new Set<string>()
  const objects = result.members.map((member) => ({
    team_name: member.teamName,
    email_address: member.email,
    first_name: member.firstName,
    last_name: member.lastName,
    gender: normalizeGamedayGender(member.gender, unrecognisedGenders),
  }))

  if (unrecognisedGenders.size > 0) {
    console.warn(
      `Unrecognised GameDay gender value(s) imported as "other": ${[
        ...unrecognisedGenders,
      ].join(', ')}`,
    )
  }

  return await importMemberObjects(objects, config.seasonId)
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
