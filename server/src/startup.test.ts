import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import config from './config'
import {runStartupIndexSync} from './db/syncIndexes'
import {runUserGenderMatchingMigration} from './migrations/userGenderMatching'
import {runStartupTasks} from './startup'

vi.mock('./db/syncIndexes', () => ({runStartupIndexSync: vi.fn()}))
vi.mock('./migrations/userGenderMatching', () => ({
  runUserGenderMatchingMigration: vi.fn(),
}))

const indexSync = vi.mocked(runStartupIndexSync)
const migration = vi.mocked(runUserGenderMatchingMigration)
const isProduction = config.IS_PRODUCTION

beforeEach(() => {
  indexSync.mockResolvedValue(undefined)
  migration.mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  config.IS_PRODUCTION = isProduction
  indexSync.mockReset()
  migration.mockReset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('runStartupTasks', () => {
  it('runs every task in order', async () => {
    const order: string[] = []
    indexSync.mockImplementation(async () => {
      order.push('index')
    })
    migration.mockImplementation(async () => {
      order.push('migration')
    })
    await runStartupTasks()
    expect(order).toEqual(['index', 'migration'])
  })

  it('fails immediately outside production', async () => {
    config.IS_PRODUCTION = false
    const failure = new Error('mongo down')
    indexSync.mockRejectedValue(failure)
    await expect(runStartupTasks()).rejects.toBe(failure)
    expect(indexSync).toHaveBeenCalledTimes(1)
    expect(migration).not.toHaveBeenCalled()
  })

  it('retries with backoff in production until a task succeeds', async () => {
    vi.useFakeTimers()
    config.IS_PRODUCTION = true
    indexSync
      .mockRejectedValueOnce(new TypeError('first'))
      .mockRejectedValueOnce('second')
      .mockRejectedValueOnce(new Error('third'))
      .mockResolvedValue(undefined)

    const result = runStartupTasks()
    await vi.runAllTimersAsync()
    await result

    expect(indexSync).toHaveBeenCalledTimes(4)
    expect(migration).toHaveBeenCalledTimes(1)
    expect(vi.mocked(console.warn).mock.calls.map((call) => call[0])).toEqual([
      'Startup task "Mongo index sync" failed on attempt 1. Retrying in 1000ms. TypeError: first',
      'Startup task "Mongo index sync" failed on attempt 2. Retrying in 2000ms. second',
      'Startup task "Mongo index sync" failed on attempt 3. Retrying in 4000ms. Error: third',
    ])
    expect(console.log).toHaveBeenCalledWith(
      'Startup task "Mongo index sync" succeeded after 4 attempts.',
    )
  })

  it('caps the delay and gives up after the retry budget', async () => {
    vi.useFakeTimers()
    config.IS_PRODUCTION = true
    const failure = new Error('still down')
    migration.mockRejectedValue(failure)

    const result = runStartupTasks()
    const assertion = expect(result).rejects.toBe(failure)
    await vi.runAllTimersAsync()
    await assertion

    const delays = vi
      .mocked(console.warn)
      .mock.calls.map((call) => Number(/Retrying in (\d+)ms/.exec(String(call[0]))?.[1]))
    expect(delays.slice(0, 6)).toEqual([1000, 2000, 4000, 8000, 10000, 10000])
    // the waits never run past the four minute budget
    expect(delays.reduce((total, delay) => total + delay, 0)).toBe(4 * 60 * 1000)
    // the first task succeeded once and is not retried
    expect(indexSync).toHaveBeenCalledTimes(1)
  })
})
