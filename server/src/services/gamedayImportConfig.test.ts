import {describe, expect, it} from 'vitest'
import {
  hasGamedayScheduleChanged,
  readGamedayScheduleFields,
  readNewGamedayPassword,
} from './gamedayImportConfig'

describe('readNewGamedayPassword', () => {
  it('keeps the existing password when none or a blank one is given', () => {
    expect(readNewGamedayPassword({})).toBeUndefined()
    expect(readNewGamedayPassword({password: '   '})).toBeUndefined()
  })

  it('returns the password untrimmed', () => {
    expect(readNewGamedayPassword({password: ' secret '})).toBe(' secret ')
  })
})

describe('readGamedayScheduleFields', () => {
  it('clears the date range when the schedule is disabled', () => {
    expect(
      readGamedayScheduleFields({
        scheduleEnabled: false,
        scheduleStartOn: '2026-01-01',
        scheduleEndOn: '2026-02-01',
      }),
    ).toEqual({
      scheduleEnabled: false,
      scheduleStartOn: undefined,
      scheduleEndOn: undefined,
    })
  })

  it('keeps a valid date range', () => {
    const fields = {
      scheduleEnabled: true,
      scheduleStartOn: '2026-01-01',
      scheduleEndOn: '2026-01-01',
    }
    expect(readGamedayScheduleFields(fields)).toEqual(fields)
  })

  it('requires both dates when enabled', () => {
    expect(() =>
      readGamedayScheduleFields({
        scheduleEnabled: true,
        scheduleStartOn: '2026-01-01',
      }),
    ).toThrow('GameDay schedule date range is required.')
  })

  it('rejects a start date after the end date', () => {
    expect(() =>
      readGamedayScheduleFields({
        scheduleEnabled: true,
        scheduleStartOn: '2026-02-01',
        scheduleEndOn: '2026-01-01',
      }),
    ).toThrow('GameDay schedule start date must be before the end date.')
  })
})

describe('hasGamedayScheduleChanged', () => {
  const schedule = {
    scheduleEnabled: true,
    scheduleStartOn: '2026-01-01',
    scheduleEndOn: '2026-02-01',
  }

  it('is false for the same schedule', () => {
    expect(hasGamedayScheduleChanged(schedule, {...schedule})).toBe(false)
  })

  it('is true when any schedule field differs', () => {
    expect(
      hasGamedayScheduleChanged(schedule, {...schedule, scheduleEnabled: false}),
    ).toBe(true)
    expect(
      hasGamedayScheduleChanged(schedule, {
        ...schedule,
        scheduleEndOn: '2026-03-01',
      }),
    ).toBe(true)
  })
})
