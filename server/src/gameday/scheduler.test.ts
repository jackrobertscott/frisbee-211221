import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {afterAll, describe, expect, it, vi} from 'vitest'
import {useTestDatabase} from '../../test/database'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {runGamedayImportWithHistory} from './importMembers'
import {isGamedayImportDue, startGamedayImportScheduler} from './scheduler'

vi.mock('./importMembers', () => ({runGamedayImportWithHistory: vi.fn()}))

useTestDatabase()

const START = '2024-01-01T00:00:00.000Z'
const END = '2024-01-10T00:00:00.000Z'
const START_MS = Date.parse(START)
const DAY_MS = 24 * 60 * 60 * 1000

const makeConfig = (
  overrides: Partial<TGamedayImportConfig> = {},
): TGamedayImportConfig => ({
  id: 'config1',
  createdOn: START,
  updatedOn: START,
  seasonId: 'season1',
  username: 'user',
  passwordEncrypted: 'v1:a:b:c',
  association: 'assoc',
  competition: 'comp',
  scheduleEnabled: true,
  scheduleStartOn: START,
  scheduleEndOn: END,
  ...overrides,
})

const at = (ms: number) => new Date(ms)

describe('isGamedayImportDue', () => {
  it('is due during the first minute after each daily run time', () => {
    const config = makeConfig()
    expect(isGamedayImportDue(config, at(START_MS))).toBe(true)
    expect(isGamedayImportDue(config, at(START_MS + 59_999))).toBe(true)
    expect(isGamedayImportDue(config, at(START_MS + 3 * DAY_MS + 30_000))).toBe(
      true,
    )
  })

  it('is not due outside the one-minute window', () => {
    const config = makeConfig()
    expect(isGamedayImportDue(config, at(START_MS + 60_000))).toBe(false)
    expect(isGamedayImportDue(config, at(START_MS + 12 * 60 * 60 * 1000))).toBe(
      false,
    )
    expect(isGamedayImportDue(config, at(START_MS + DAY_MS - 1))).toBe(false)
  })

  it('is bounded by the start and the end of the end day', () => {
    const config = makeConfig()
    expect(isGamedayImportDue(config, at(START_MS - 1))).toBe(false)
    expect(isGamedayImportDue(config, at(Date.parse(END)))).toBe(true)
    expect(isGamedayImportDue(config, at(Date.parse(END) + DAY_MS))).toBe(false)
  })

  it('is not due when the run key for this day has already run', () => {
    const now = at(START_MS + 2 * DAY_MS + 1000)
    expect(
      isGamedayImportDue(makeConfig({lastScheduledRunKey: `${START}:2`}), now),
    ).toBe(false)
    expect(
      isGamedayImportDue(makeConfig({lastScheduledRunKey: `${START}:1`}), now),
    ).toBe(true)
  })

  it('is not due without a valid schedule window', () => {
    const now = at(START_MS)
    expect(
      isGamedayImportDue(makeConfig({scheduleStartOn: undefined}), now),
    ).toBe(false)
    expect(
      isGamedayImportDue(makeConfig({scheduleEndOn: undefined}), now),
    ).toBe(false)
    expect(isGamedayImportDue(makeConfig({scheduleStartOn: 'nope'}), now)).toBe(
      false,
    )
  })

  it('does not check scheduleEnabled (the scheduler query filters on it)', () => {
    expect(
      isGamedayImportDue(makeConfig({scheduleEnabled: false}), at(START_MS)),
    ).toBe(true)
  })

  it('follows the time of day of scheduleStartOn', () => {
    const start = '2024-01-01T08:30:00.000Z'
    const config = makeConfig({scheduleStartOn: start})
    const startMs = Date.parse(start)
    expect(isGamedayImportDue(config, at(startMs + DAY_MS + 10))).toBe(true)
    expect(isGamedayImportDue(config, at(START_MS + DAY_MS))).toBe(false)
  })
})

describe('startGamedayImportScheduler', () => {
  const runMock = vi.mocked(runGamedayImportWithHistory)
  const realSetInterval = globalThis.setInterval

  afterAll(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const createConfig = (
    seasonId: string,
    overrides: Partial<TGamedayImportConfig>,
  ) =>
    $GamedayImportConfig.createOne({
      seasonId,
      username: 'user',
      passwordEncrypted: 'v1:a:b:c',
      association: 'assoc',
      competition: 'comp',
      ...overrides,
    })

  it('runs due imports under a lock, at most three per check', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')

    // the scheduler stays off while disabled
    vi.stubEnv('GAMEDAY_IMPORT_SCHEDULER_DISABLED', ' Yes ')
    startGamedayImportScheduler()
    expect(intervalSpy).not.toHaveBeenCalled()

    // today's run is due for the first minute after scheduleStartOn's time
    const start = new Date(Date.now() - 5_000).toISOString()
    const runKey = `${start}:0`
    const schedule = {
      scheduleEnabled: true,
      scheduleStartOn: start,
      scheduleEndOn: start,
    }
    const ok = await createConfig('season-ok', {
      ...schedule,
      updatedOn: '2024-01-01T00:00:01.000Z',
    })
    const failing = await createConfig('season-failing', {
      ...schedule,
      updatedOn: '2024-01-01T00:00:02.000Z',
    })
    const locked = await createConfig('season-locked', {
      ...schedule,
      updatedOn: '2024-01-01T00:00:03.000Z',
      scheduleLockedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scheduleLockToken: 'other-token',
    })
    const overLimit = await createConfig('season-over-limit', {
      ...schedule,
      updatedOn: '2024-01-01T00:00:04.000Z',
    })
    const alreadyRun = await createConfig('season-already-run', {
      ...schedule,
      lastScheduledRunKey: runKey,
    })
    const disabled = await createConfig('season-disabled', {
      ...schedule,
      scheduleEnabled: false,
    })

    const failure = new Error('export failed')
    runMock.mockImplementation(async (config) => {
      if (config.id === failing.id) throw failure
      if (config.id === overLimit.id) {
        // deleting the config makes releasing its lock fail
        await $GamedayImportConfig.deleteOne({id: config.id})
      }
      return {rowsImported: 0, teamsCreated: 0, usersCreated: 0, membersCreated: 0}
    })

    let nextCheck: (() => void) | undefined
    intervalSpy.mockImplementationOnce((callback: () => void) => {
      nextCheck = callback
      return realSetInterval(() => undefined, 2 ** 30)
    })

    vi.stubEnv('GAMEDAY_IMPORT_SCHEDULER_DISABLED', '')
    startGamedayImportScheduler()
    // starting again while running is a no-op
    startGamedayImportScheduler()
    expect(intervalSpy).toHaveBeenCalledTimes(1)
    expect(intervalSpy.mock.calls[0][1]).toBe(60_000)

    await vi.waitFor(async () => {
      expect(runMock).toHaveBeenCalledTimes(2)
      const stored = await $GamedayImportConfig.getMany({
        id: {$in: [ok.id, failing.id]},
      })
      expect(stored.every((config) => !config.scheduleLockToken)).toBe(true)
    })

    const firstRuns = runMock.mock.calls.map(([config, trigger]) => {
      expect(trigger).toBe('scheduled')
      expect(config.scheduleLockToken).toMatch(/.+/)
      expect(config.lastScheduledRunKey).toBe(runKey)
      return config.id
    })
    expect(firstRuns).toEqual([ok.id, failing.id])
    expect(errors).toHaveBeenCalledWith(
      'Scheduled GameDay import failed for season season-failing.',
      failure,
    )

    for (const id of [ok.id, failing.id]) {
      const stored = await $GamedayImportConfig.getOne({id})
      expect(stored.lastScheduledRunKey).toBe(runKey)
      expect(stored.scheduleLockedUntil).toBeUndefined()
    }
    // another scheduler's lock is left alone
    const stillLocked = await $GamedayImportConfig.getOne({id: locked.id})
    expect(stillLocked.scheduleLockToken).toBe('other-token')
    expect(stillLocked.lastScheduledRunKey).toBeUndefined()

    // the next check picks up the config past the per-check limit only
    nextCheck?.()
    await vi.waitFor(() => {
      expect(errors).toHaveBeenCalledWith(
        'Failed to release GameDay import schedule lock.',
        expect.objectContaining({errorCode: 'db.record_not_found'}),
      )
    })
    expect(runMock.mock.calls.map(([config]) => config.id)).toEqual([
      ok.id,
      failing.id,
      overLimit.id,
    ])
    expect(runMock.mock.calls.map(([config]) => config.id)).not.toContain(
      alreadyRun.id,
    )
    expect(runMock.mock.calls.map(([config]) => config.id)).not.toContain(
      disabled.id,
    )
  })
})
