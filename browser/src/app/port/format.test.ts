import {describe, expect, it} from 'vitest'
import {
  fileStamp,
  fmtOptionalRunDate,
  fmtRunDate,
  fmtRunNumber,
  fmtRunStatus,
  fmtRunTime,
  fmtRunTrigger,
  withPickedDay,
} from './format'

// Local-time dates so the expectations hold in any timezone.
const local = (...parts: [number, number, number, number?, number?, number?]) =>
  new Date(...parts)

describe('import run formatting', () => {
  it('formats run dates in 24 hour time', () => {
    expect(fmtRunDate(local(2026, 2, 9, 7, 5).toISOString())).toBe(
      '9 Mar 2026, 07:05',
    )
    expect(fmtOptionalRunDate(undefined)).toBe('—')
  })

  it('labels triggers, statuses and counts', () => {
    expect(fmtRunTrigger('scheduled')).toBe('Scheduled')
    expect(fmtRunTrigger('manual')).toBe('Manual')
    expect(fmtRunStatus('succeeded')).toBe('Succeeded')
    expect(fmtRunStatus('failed')).toBe('Failed')
    expect(fmtRunStatus('running')).toBe('Running')
    expect(fmtRunNumber(0)).toBe('0')
    expect(fmtRunNumber(undefined)).toBe('—')
  })

  it('formats the schedule time as h:mmam/pm', () => {
    expect(fmtRunTime(undefined)).toBe('12:00am')
    expect(fmtRunTime(local(2026, 0, 1, 0, 30).toISOString())).toBe('12:30am')
    expect(fmtRunTime(local(2026, 0, 1, 12, 0).toISOString())).toBe('12:00pm')
    expect(fmtRunTime(local(2026, 0, 1, 18, 5).toISOString())).toBe('6:05pm')
  })
})

describe('fileStamp', () => {
  it('pads every part', () => {
    expect(fileStamp(local(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02-030405')
  })
})

describe('withPickedDay', () => {
  it('keeps the previous time of day', () => {
    const previous = local(2026, 0, 1, 18, 30).toISOString()
    expect(withPickedDay(local(2026, 5, 15), previous)).toBe(
      local(2026, 5, 15, 18, 30).toISOString(),
    )
  })

  it('starts at midnight without a previous value', () => {
    expect(withPickedDay(local(2026, 5, 15, 9, 45))).toBe(
      local(2026, 5, 15).toISOString(),
    )
  })
})
