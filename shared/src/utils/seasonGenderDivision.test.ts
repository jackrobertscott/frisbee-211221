import {describe, expect, it} from 'vitest'
import {
  getSeasonGenderDivision,
  getSeasonMvpSlots,
  isReportMvpCompleteForSeason,
  isSeasonMvpSlotEnabled,
  isUserEligibleForMvpSlot,
  sanitizeSeasonMvpFields,
} from './seasonGenderDivision'

const mixed = {genderDivision: 'mixed' as const}
const men = {genderDivision: 'men' as const}
const women = {genderDivision: 'women' as const}

describe('getSeasonGenderDivision', () => {
  it('defaults to mixed', () => {
    expect(getSeasonGenderDivision(undefined)).toBe('mixed')
    expect(getSeasonGenderDivision({})).toBe('mixed')
    expect(getSeasonGenderDivision(men)).toBe('men')
    expect(getSeasonGenderDivision(women)).toBe('women')
  })
})

describe('MVP slots', () => {
  it('enables slots by division', () => {
    expect(getSeasonMvpSlots(undefined)).toEqual({male: true, female: true})
    expect(getSeasonMvpSlots(mixed)).toEqual({male: true, female: true})
    expect(getSeasonMvpSlots(men)).toEqual({male: true, female: false})
    expect(getSeasonMvpSlots(women)).toEqual({male: false, female: true})
    expect(isSeasonMvpSlotEnabled(men, 'female')).toBe(false)
    expect(isSeasonMvpSlotEnabled(women, 'female')).toBe(true)
  })

  it('only lets users fill the slot of their gender matching', () => {
    expect(isUserEligibleForMvpSlot({genderMatching: 'male'}, 'male')).toBe(
      true,
    )
    expect(isUserEligibleForMvpSlot({genderMatching: 'male'}, 'female')).toBe(
      false,
    )
    expect(isUserEligibleForMvpSlot({genderMatching: 'female'}, 'female')).toBe(
      true,
    )
    expect(isUserEligibleForMvpSlot({genderMatching: 'female'}, 'male')).toBe(
      false,
    )
  })
})

describe('sanitizeSeasonMvpFields', () => {
  const fields = {
    mvpMale: 'm1',
    mvpMale2: 'm2',
    mvpFemale: 'f1',
    mvpFemale2: 'f2',
  }

  it('clears fields for disabled slots', () => {
    expect(sanitizeSeasonMvpFields(mixed, fields)).toEqual(fields)
    expect(sanitizeSeasonMvpFields(men, fields)).toEqual({
      mvpMale: 'm1',
      mvpMale2: 'm2',
      mvpFemale: undefined,
      mvpFemale2: undefined,
    })
    expect(sanitizeSeasonMvpFields(women, fields)).toEqual({
      mvpMale: undefined,
      mvpMale2: undefined,
      mvpFemale: 'f1',
      mvpFemale2: 'f2',
    })
  })
})

describe('isReportMvpCompleteForSeason', () => {
  it('requires primary MVPs for enabled slots', () => {
    expect(isReportMvpCompleteForSeason({}, mixed, false)).toBe('empty')
    expect(isReportMvpCompleteForSeason({mvpMale: 'a'}, mixed, false)).toBe(
      'partial',
    )
    expect(
      isReportMvpCompleteForSeason(
        {mvpMale: 'a', mvpFemale: 'b'},
        mixed,
        false,
      ),
    ).toBe('complete')
    expect(isReportMvpCompleteForSeason({mvpMale: 'a'}, men, false)).toBe(
      'complete',
    )
    expect(isReportMvpCompleteForSeason({mvpFemale: 'b'}, men, false)).toBe(
      'empty',
    )
  })

  it('requires secondary MVPs only with official scoring', () => {
    const primary = {mvpMale: 'a', mvpFemale: 'b'}
    expect(isReportMvpCompleteForSeason(primary, mixed, undefined)).toBe(
      'complete',
    )
    expect(isReportMvpCompleteForSeason(primary, mixed, true)).toBe('partial')
    expect(
      isReportMvpCompleteForSeason(
        {...primary, mvpMale2: 'c', mvpFemale2: 'd'},
        mixed,
        true,
      ),
    ).toBe('complete')
    expect(
      isReportMvpCompleteForSeason(
        {mvpFemale: 'b', mvpFemale2: 'd'},
        women,
        true,
      ),
    ).toBe('complete')
  })

  it('treats secondary-only reports as empty', () => {
    expect(
      isReportMvpCompleteForSeason(
        {mvpMale2: 'c', mvpFemale2: 'd'},
        mixed,
        true,
      ),
    ).toBe('empty')
  })
})
