import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {random} from '../utils/random'
import {runGamedayImportWithHistory} from './importMembers'

const CHECK_INTERVAL_MS = 60 * 1000
// Only run during the scheduler check window after the standard run time.
// Missed windows are skipped instead of caught up later at arbitrary times.
const SCHEDULE_DUE_WINDOW_MS = CHECK_INTERVAL_MS
const SCHEDULE_LOCK_MS = 2 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RUNS_PER_CHECK = 3

let timer: ReturnType<typeof setInterval> | undefined
let checking = false

export const startGamedayImportScheduler = () => {
  if (timer || isSchedulerDisabled()) return

  console.log('Starting GameDay import scheduler...')
  void checkDueGamedayImports()
  timer = setInterval(() => {
    void checkDueGamedayImports()
  }, CHECK_INTERVAL_MS)
  timer.unref()
}

const checkDueGamedayImports = async () => {
  if (checking) return
  checking = true
  try {
    const now = new Date()
    const configs = await $GamedayImportConfig.getMany(
      {scheduleEnabled: true},
      {sort: {updatedOn: 1}, limit: 100},
    )
    const dueConfigs = configs
      .filter((config) => isGamedayImportDue(config, now))
      .slice(0, MAX_RUNS_PER_CHECK)

    for (const config of dueConfigs) {
      await runScheduledGamedayImport(config)
    }
  } catch (error) {
    console.error('GameDay import scheduler failed.', error)
  } finally {
    checking = false
  }
}

const runScheduledGamedayImport = async (config: TGamedayImportConfig) => {
  const now = new Date()
  const scheduleStartOn = config.scheduleStartOn
  const scheduleEndOn = config.scheduleEndOn
  const runKey = readDueScheduleRunKey(config, now)
  if (!runKey || !scheduleStartOn || !scheduleEndOn) return

  const lockToken = random.generateId()
  const lockedUntil = new Date(now.getTime() + SCHEDULE_LOCK_MS).toISOString()
  const lockedCount = await $GamedayImportConfig.updateMany(
    {
      id: config.id,
      scheduleEnabled: true,
      scheduleStartOn,
      scheduleEndOn,
      lastScheduledRunKey: {$ne: runKey},
      $or: [
        {scheduleLockedUntil: {$exists: false}},
        {scheduleLockedUntil: {$lte: now.toISOString()}},
      ],
    },
    {
      scheduleLockedUntil: lockedUntil,
      scheduleLockToken: lockToken,
      lastScheduledRunKey: runKey,
      updatedOn: now.toISOString(),
    },
  )
  if (!lockedCount) return

  const lockedConfig = await $GamedayImportConfig.maybeOne({
    id: config.id,
    scheduleLockToken: lockToken,
  })
  if (!lockedConfig) return

  try {
    await runGamedayImportWithHistory(lockedConfig, 'scheduled')
  } catch (error) {
    console.error(
      `Scheduled GameDay import failed for season ${lockedConfig.seasonId}.`,
      error,
    )
  } finally {
    await $GamedayImportConfig
      .updateOne(
        {id: lockedConfig.id},
        {
          scheduleLockedUntil: undefined,
          scheduleLockToken: undefined,
          updatedOn: new Date().toISOString(),
        },
      )
      .catch((error: unknown) => {
        console.error('Failed to release GameDay import schedule lock.', error)
      })
  }
}

export const isGamedayImportDue = (
  config: TGamedayImportConfig,
  now: Date,
) => {
  const runKey = readDueScheduleRunKey(config, now)
  if (!runKey) return false
  return config.lastScheduledRunKey !== runKey
}

const readDueScheduleRunKey = (
  config: TGamedayImportConfig,
  now: Date,
): string | undefined => {
  if (!config.scheduleStartOn || !config.scheduleEndOn) return undefined

  const startMs = Date.parse(config.scheduleStartOn)
  const endMs = Date.parse(config.scheduleEndOn) + DAY_MS - 1
  const nowMs = now.getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined
  if (nowMs < startMs || nowMs > endMs) return undefined

  const dayIndex = Math.floor((nowMs - startMs) / DAY_MS)
  const scheduledMs = startMs + dayIndex * DAY_MS
  const dueUntilMs = scheduledMs + SCHEDULE_DUE_WINDOW_MS
  if (nowMs < scheduledMs || nowMs >= dueUntilMs) return undefined

  return `${config.scheduleStartOn}:${dayIndex}`
}

const isSchedulerDisabled = () => {
  const value = process.env.GAMEDAY_IMPORT_SCHEDULER_DISABLED
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}
