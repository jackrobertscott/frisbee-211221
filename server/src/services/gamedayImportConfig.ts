import {badRequestError, conflictError} from '@shared/errors'
import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../tables/$GamedayImportRun'
import {$Season} from '../tables/$Season'
import {
  encryptGamedayPassword,
  toSafeGamedayImportConfig,
} from '../gameday/credentials'
import {runGamedayImportWithHistory} from '../gameday/importMembers'
import {random} from '../utils/random'

export interface TGamedayImportSavePayload {
  seasonId: string
  username: string
  password?: string
  association: string
  competition: string
  scheduleEnabled: boolean
  scheduleStartOn?: string
  scheduleEndOn?: string
}

export interface TGamedayImportScheduleFields {
  scheduleEnabled: boolean
  scheduleStartOn?: string
  scheduleEndOn?: string
}

const GAMEDAY_IMPORT_RUN_HISTORY_LIMIT = 50
const GAMEDAY_MANUAL_IMPORT_LOCK_MS = 30 * 60 * 1000

/** A season's saved GameDay config (without secrets) and recent runs. */
export const loadGamedayImportState = async (seasonId: string) => {
  await $Season.getOne({id: seasonId})
  const [config, runs] = await Promise.all([
    $GamedayImportConfig.maybeOne({seasonId}),
    $GamedayImportRun.getMany(
      {seasonId},
      {sort: {startedOn: -1}, limit: GAMEDAY_IMPORT_RUN_HISTORY_LIMIT},
    ),
  ])
  return {
    config: config ? toSafeGamedayImportConfig(config) : undefined,
    runs,
  }
}

/** Creates or updates a season's GameDay config and returns it without secrets. */
export const saveGamedayImportConfig = async (
  body: TGamedayImportSavePayload,
) => {
  await $Season.getOne({id: body.seasonId})
  const existing = await $GamedayImportConfig.maybeOne({
    seasonId: body.seasonId,
  })
  const saved = existing
    ? await updateGamedayImportConfig(existing, body)
    : await createGamedayImportConfig(body)
  return toSafeGamedayImportConfig(saved)
}

/**
 * Runs a season's GameDay import now, sharing the scheduler's lock so only one
 * import per season runs at a time.
 */
export const runManualGamedayImport = async (seasonId: string) => {
  const config = await getGamedayImportConfigForSeason(seasonId)
  const now = new Date()
  const lockToken = random.generateId()
  const locked = await $GamedayImportConfig.updateAtomic(
    {
      id: config.id,
      $or: [
        {scheduleLockedUntil: {$exists: false}},
        {scheduleLockedUntil: {$lte: now.toISOString()}},
      ],
    },
    {
      $set: {
        scheduleLockedUntil: new Date(
          now.getTime() + GAMEDAY_MANUAL_IMPORT_LOCK_MS,
        ).toISOString(),
        scheduleLockToken: lockToken,
      },
    },
  )
  if (!locked)
    throw conflictError('A GameDay import is already running for this season.', {
      errorCode: 'gameday.import_running',
      userMessage:
        'A GameDay import is already running. Try again when it finishes.',
    })
  try {
    return await runGamedayImportWithHistory(locked, 'manual')
  } finally {
    await $GamedayImportConfig
      .updateMany(
        {id: config.id, scheduleLockToken: lockToken},
        {scheduleLockedUntil: undefined, scheduleLockToken: undefined},
      )
      .catch((error: unknown) => {
        console.error('Failed to release GameDay import lock.', error)
      })
  }
}

/** The new GameDay password, or undefined when the existing one is kept. */
export const readNewGamedayPassword = (
  body: Pick<TGamedayImportSavePayload, 'password'>,
): string | undefined => {
  if (!body.password?.trim()) return undefined
  return body.password
}

/** The schedule fields to store, validating the date range when enabled. */
export const readGamedayScheduleFields = (
  body: TGamedayImportScheduleFields,
): TGamedayImportScheduleFields => {
  if (!body.scheduleEnabled) {
    return {
      scheduleEnabled: false,
      scheduleStartOn: undefined,
      scheduleEndOn: undefined,
    }
  }

  if (!body.scheduleStartOn || !body.scheduleEndOn) {
    throw badRequestError('GameDay schedule date range is required.', {
      errorCode: 'gameday.schedule_dates_missing',
      userMessage:
        'Choose schedule start and end dates before enabling the schedule.',
    })
  }

  if (Date.parse(body.scheduleStartOn) > Date.parse(body.scheduleEndOn)) {
    throw badRequestError(
      'GameDay schedule start date must be before the end date.',
      {
        errorCode: 'gameday.schedule_date_range_invalid',
        userMessage: 'Choose a GameDay schedule start date before the end date.',
      },
    )
  }

  return {
    scheduleEnabled: true,
    scheduleStartOn: body.scheduleStartOn,
    scheduleEndOn: body.scheduleEndOn,
  }
}

export const hasGamedayScheduleChanged = (
  existing: TGamedayImportScheduleFields,
  next: TGamedayImportScheduleFields,
): boolean => {
  return (
    existing.scheduleEnabled !== next.scheduleEnabled ||
    existing.scheduleStartOn !== next.scheduleStartOn ||
    existing.scheduleEndOn !== next.scheduleEndOn
  )
}

const getGamedayImportConfigForSeason = async (seasonId: string) => {
  await $Season.getOne({id: seasonId})
  const config = await $GamedayImportConfig.maybeOne({seasonId})
  if (!config)
    throw badRequestError(
      'GameDay credentials have not been saved for this season.',
      {
        errorCode: 'gameday.credentials_missing',
        userMessage: 'Save GameDay credentials before running the import.',
      },
    )
  return config
}

const createGamedayImportConfig = async (body: TGamedayImportSavePayload) => {
  const password = readNewGamedayPassword(body)
  if (!password)
    throw badRequestError('GameDay password is required.', {
      errorCode: 'gameday.password_missing',
      userMessage: 'Enter the GameDay password before saving credentials.',
    })
  const schedule = readGamedayScheduleFields(body)
  return await $GamedayImportConfig.createOne({
    seasonId: body.seasonId,
    username: body.username,
    passwordEncrypted: encryptGamedayPassword(password),
    association: body.association,
    competition: body.competition,
    ...schedule,
  })
}

const updateGamedayImportConfig = async (
  existing: TGamedayImportConfig,
  body: TGamedayImportSavePayload,
) => {
  const schedule = readGamedayScheduleFields(body)
  const password = readNewGamedayPassword(body)
  const scheduleChanged = hasGamedayScheduleChanged(existing, schedule)
  const update: Partial<TGamedayImportConfig> = {
    username: body.username,
    association: body.association,
    competition: body.competition,
    updatedOn: new Date().toISOString(),
    scheduleEnabled: schedule.scheduleEnabled,
    scheduleStartOn: schedule.scheduleStartOn,
    scheduleEndOn: schedule.scheduleEndOn,
    ...(password ? {passwordEncrypted: encryptGamedayPassword(password)} : {}),
    ...(scheduleChanged ? {lastScheduledRunKey: undefined} : {}),
  }
  return await $GamedayImportConfig.updateOne({id: existing.id}, update)
}
