import {describe, expect, it} from 'vitest'
import {
  ioUserGenderMatching,
  isUserGenderMatching,
  normalizeUserGenderMatching,
  TUserGenderMatching,
} from './ioUserGenderMatching'

const expectAll = (
  values: string[],
  expected: TUserGenderMatching | undefined,
) => {
  for (const value of values) {
    expect(normalizeUserGenderMatching(value), value).toBe(expected)
  }
}

describe('normalizeUserGenderMatching', () => {
  it('maps exact aliases regardless of case, spacing and punctuation', () => {
    expectAll(
      [
        'male',
        'Male',
        ' MALE ',
        'm',
        'Man',
        'mens',
        'MMP',
        'Male-matching',
        'Male Matching',
        'trans man',
        'FTM',
        'female to male',
      ],
      'male',
    )
    expectAll(
      [
        'female',
        'F',
        'Woman',
        'womxn',
        'Ladies',
        'FMP',
        'female-matching',
        'Trans Woman',
        'MTF',
        'male to female',
      ],
      'female',
    )
  })

  it('returns undefined for empty or punctuation-only values', () => {
    expectAll(['', '   ', '!!!', '/'], undefined)
  })

  it('infers a single matching from words in longer values', () => {
    expectAll(['Male (he/him)', 'mens team', 'Boys'], 'male')
    expectAll(['Woman, she/her', 'female player'], 'female')
  })

  it('does not match non-binary, other or opt-out values', () => {
    expectAll(
      [
        'non-binary',
        'Non Binary',
        'nonbinary',
        'NB',
        'x',
        'Gender Diverse',
        'non-binary person',
        'nonbinary woman',
        'nb male',
        'other',
        'Other: male',
        'unspecified (male)',
        'Prefer not to say',
        'Declined to state',
        'I self-describe as x',
        'N/A',
      ],
      undefined,
    )
  })

  it('does not match ambiguous or unrecognised values', () => {
    expectAll(
      ['Male/Female', 'man or woman', 'femme', 'W', 'Females', 'abc', 'masc'],
      undefined,
    )
  })
})

describe('isUserGenderMatching', () => {
  it('accepts only male and female', () => {
    expect(isUserGenderMatching('male')).toBe(true)
    expect(isUserGenderMatching('female')).toBe(true)
    expect(isUserGenderMatching('non-binary')).toBe(false)
    expect(isUserGenderMatching('other')).toBe(false)
    expect(isUserGenderMatching(null)).toBe(false)
  })
})

describe('ioUserGenderMatching', () => {
  it('normalises valid values', () => {
    expect(
      ioUserGenderMatching.validate('Woman' as TUserGenderMatching),
    ).toEqual({
      ok: true,
      value: 'female',
    })
  })

  it('rejects non-strings and unrecognised values', () => {
    expect(
      ioUserGenderMatching.validate(1 as unknown as TUserGenderMatching),
    ).toEqual({
      ok: false,
      error: 'Enum value is not a string.',
    })
    for (const value of ['abc', 'non-binary', 'other']) {
      expect(
        ioUserGenderMatching.validate(value as TUserGenderMatching),
      ).toEqual({
        ok: false,
        error: 'Value is not a valid enum option.',
      })
    }
  })
})
