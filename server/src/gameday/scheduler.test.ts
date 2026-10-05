import {TGamedayImportConfig} from '@shared/schemas/ioGamedayImport'
import {describe, expect, it} from 'vitest'
import {isGamedayImportDue} from './scheduler'

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
