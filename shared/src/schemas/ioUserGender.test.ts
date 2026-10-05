import {describe, expect, it} from 'vitest'
import {ioUserGender, normalizeUserGender, TUserGender} from './ioUserGender'

const expectAll = (values: string[], expected: TUserGender | undefined) => {
  for (const value of values) {
    expect(normalizeUserGender(value), value).toBe(expected)
  }
}

describe('normalizeUserGender', () => {
  it('maps exact aliases regardless of case, spacing and punctuation', () => {
    expectAll(
      [
        'male',
        'Male',
        ' MALE ',
        'm',
        'Man',
        'mens',
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
        'female-matching',
        'Trans Woman',
        'MTF',
        'male to female',
      ],
      'female',
    )
    expectAll(
      [
        'non-binary',
        'Non Binary',
        'nonbinary',
        'NB',
        'x',
        'enby',
        'Gender Diverse',
        'Non-Binary / Gender Diverse',
        'genderfluid',
        'agender',
      ],
      'non-binary',
    )
    expectAll(
      [
        'other',
        'O',
        'u',
        'Unknown',
        'Prefer not to say',
        'N/A',
        'na',
        'none',
        'Self-Described',
        'not listed',
      ],
      'other',
    )
  })

  it('returns undefined for empty or punctuation-only values', () => {
    expectAll(['', '   ', '!!!', '/'], undefined)
  })

  it('infers a single gender from words in longer values', () => {
    expectAll(['Male (he/him)', 'mens team', 'Boys'], 'male')
    expectAll(['Woman, she/her', 'female player'], 'female')
    expectAll(
      ['non-binary person', 'genderqueer/they', 'they / nb'],
      'non-binary',
    )
  })

  it('treats ambiguous or multiple inferred genders as other', () => {
    expectAll(
      ['Male/Female', 'man or woman', 'nonbinary woman', 'nb male'],
      'other',
    )
  })

  it('treats opt-out phrasing as other', () => {
    expectAll(
      [
        'Prefer not to disclose',
        'Declined to state',
        'would rather not say',
        'rather not answer',
        'I self-describe as x',
        'Other: male',
        'unspecified (male)',
      ],
      'other',
    )
  })

  it('returns undefined for unrecognised values', () => {
    expectAll(['femme', 'W', 'Females', 'abc', 'masc'], undefined)
  })
})

describe('ioUserGender', () => {
  it('normalises valid values', () => {
    expect(ioUserGender.validate('Woman' as TUserGender)).toEqual({
      ok: true,
      value: 'female',
    })
  })

  it('rejects non-strings and unrecognised values', () => {
    expect(ioUserGender.validate(1 as unknown as TUserGender)).toEqual({
      ok: false,
      error: 'Enum value is not a string.',
    })
    expect(ioUserGender.validate('abc' as TUserGender)).toEqual({
      ok: false,
      error: 'Value is not a valid enum option.',
    })
  })
})
