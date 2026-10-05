import {describe, expect, it} from 'vitest'
import {
  getOfficialSpiritScoreTotal,
  hasSpiritComment,
  officialSpiritCommentRequired,
  validateOfficialSpiritComment,
} from './reportValidation'

const scores = (
  p1: number,
  p2: number,
  p3: number,
  p4: number,
  p5: number,
) => ({
  spiritP1: p1,
  spiritP2: p2,
  spiritP3: p3,
  spiritP4: p4,
  spiritP5: p5,
})

const MESSAGE =
  'A comment is required when the total spirit score is below 9 or above 11.'

describe('getOfficialSpiritScoreTotal', () => {
  it('sums all five scores', () => {
    expect(getOfficialSpiritScoreTotal(scores(2, 2, 2, 2, 2))).toBe(10)
    expect(getOfficialSpiritScoreTotal(scores(0, 0, 0, 0, 0))).toBe(0)
  })

  it('returns undefined when any score is missing', () => {
    expect(
      getOfficialSpiritScoreTotal({
        ...scores(2, 2, 2, 2, 2),
        spiritP3: undefined,
      }),
    ).toBeUndefined()
    expect(getOfficialSpiritScoreTotal({})).toBeUndefined()
  })
})

describe('officialSpiritCommentRequired', () => {
  it('requires a comment outside 9..11 inclusive', () => {
    expect(officialSpiritCommentRequired(scores(2, 2, 2, 2, 0))).toBe(true) // 8
    expect(officialSpiritCommentRequired(scores(2, 2, 2, 2, 1))).toBe(false) // 9
    expect(officialSpiritCommentRequired(scores(2, 2, 2, 2, 2))).toBe(false) // 10
    expect(officialSpiritCommentRequired(scores(3, 2, 2, 2, 2))).toBe(false) // 11
    expect(officialSpiritCommentRequired(scores(3, 3, 2, 2, 2))).toBe(true) // 12
  })

  it('does not require a comment for incomplete scores', () => {
    expect(officialSpiritCommentRequired({spiritP1: 0})).toBe(false)
  })
})

describe('hasSpiritComment', () => {
  it('requires non-whitespace content', () => {
    expect(hasSpiritComment('Great game')).toBe(true)
    expect(hasSpiritComment('   ')).toBe(false)
    expect(hasSpiritComment('')).toBe(false)
  })
})

describe('validateOfficialSpiritComment', () => {
  it('returns an error when a required comment is missing', () => {
    expect(
      validateOfficialSpiritComment({
        ...scores(0, 0, 0, 0, 0),
        spiritComment: ' ',
      }),
    ).toBe(MESSAGE)
    expect(
      validateOfficialSpiritComment({
        ...scores(4, 4, 4, 4, 4),
        spiritComment: '',
      }),
    ).toBe(MESSAGE)
  })

  it('passes with a comment or an in-range total', () => {
    expect(
      validateOfficialSpiritComment({
        ...scores(0, 0, 0, 0, 0),
        spiritComment: 'Rough',
      }),
    ).toBeUndefined()
    expect(
      validateOfficialSpiritComment({
        ...scores(2, 2, 2, 2, 2),
        spiritComment: '',
      }),
    ).toBeUndefined()
    expect(validateOfficialSpiritComment({spiritComment: ''})).toBeUndefined()
  })
})
