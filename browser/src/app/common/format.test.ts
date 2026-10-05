import {describe, expect, it} from 'vitest'
import {fmtDate, fmtDateTime, fmtShort, fullName, initials} from './format'

// Local-time dates so the expectations hold in any timezone.
const date = new Date(2026, 0, 5, 15, 7)

describe('date formatting', () => {
  it('formats a readable date', () => {
    expect(fmtDate(date)).toBe('5 Jan 2026')
  })

  it('formats a short dd/mm/yy date', () => {
    expect(fmtShort(date)).toBe('05/01/26')
  })

  it('formats a short date with time', () => {
    expect(fmtDateTime(date)).toMatch(/^05\/01\/26, 3:07\spm$/)
  })

  it('accepts timestamps and date strings', () => {
    expect(fmtShort(date.valueOf())).toBe('05/01/26')
    expect(fmtShort(date.toISOString())).toBe('05/01/26')
  })
})

describe('fullName', () => {
  it('joins and trims first and last names', () => {
    expect(fullName({firstName: 'Ada', lastName: 'Lovelace'})).toBe(
      'Ada Lovelace',
    )
    expect(fullName({firstName: 'Ada', lastName: ''})).toBe('Ada')
  })
})

describe('initials', () => {
  it('uppercases word initials, skipping a leading "the"', () => {
    expect(initials('The flying discs')).toBe('FD')
    expect(initials('  hucks   and  hammers ')).toBe('HAH')
  })
})
