import {TFixture} from '@shared/schemas/ioFixture'
import {TSeason, TSeasonGenderDivision} from '@shared/schemas/ioSeason'
import {TUserPublic} from '@shared/schemas/ioUser'
import {TUserGender} from '@shared/schemas/ioUserGender'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  createReportCreatePayload,
  createReportFormData,
  createReportFormDataFromReport,
  createReportUpdatePayload,
  eligibleMvpUsers,
  getLatestPastFixtureId,
  getReportMvpSlots,
  reportSpiritTotal,
  sameMvps,
  sanitizeReportFormMvps,
  shuffleArray,
  validateReportForm,
  type ReportFormData,
} from './reportForm'
import {SPIRIT_DEFAULT_SCORE} from './spirit'

const DATE = '2026-01-01T00:00:00.000Z'

const season = (genderDivision?: TSeasonGenderDivision): TSeason => ({
  id: 's1',
  createdOn: DATE,
  updatedOn: DATE,
  name: 'Season',
  signUpOpen: true,
  genderDivision,
})

const user = (id: string, gender: TUserGender): TUserPublic => ({
  id,
  createdOn: DATE,
  updatedOn: DATE,
  firstName: id,
  lastName: 'Player',
  gender,
})

const fixture = (id: string, date: string): TFixture => ({
  id,
  createdOn: DATE,
  updatedOn: DATE,
  seasonId: 's1',
  userId: 'u1',
  title: id,
  date,
  games: [],
})

/** A form that passes validation in both scoring modes. */
const filled = (overrides: Partial<ReportFormData> = {}) =>
  createReportFormData({
    teamId: 't1',
    againstTeamId: 't2',
    fixtureId: 'f1',
    scoreFor: 11,
    scoreAgainst: 7,
    ...overrides,
  })

describe('createReportFormData', () => {
  it('starts empty with default spirit scores', () => {
    expect(createReportFormData()).toEqual({
      teamId: undefined,
      againstTeamId: undefined,
      fixtureId: undefined,
      scoreFor: undefined,
      scoreAgainst: undefined,
      mvpMale: undefined,
      mvpFemale: undefined,
      mvpMale2: undefined,
      mvpFemale2: undefined,
      spirit: SPIRIT_DEFAULT_SCORE,
      spiritComment: '',
      spiritP1: SPIRIT_DEFAULT_SCORE,
      spiritP2: SPIRIT_DEFAULT_SCORE,
      spiritP3: SPIRIT_DEFAULT_SCORE,
      spiritP4: SPIRIT_DEFAULT_SCORE,
      spiritP5: SPIRIT_DEFAULT_SCORE,
    })
  })

  it('maps a saved report, defaulting missing spirit scores', () => {
    const data = createReportFormDataFromReport({
      teamId: 't1',
      teamAgainstId: 't2',
      fixtureId: 'f1',
      scoreFor: 3,
      scoreAgainst: 4,
      mvpFemale: 'u9',
      spiritP3: 4,
      spiritComment: 'Great game',
    })
    expect(data).toMatchObject({
      teamId: 't1',
      againstTeamId: 't2',
      fixtureId: 'f1',
      scoreFor: 3,
      scoreAgainst: 4,
      mvpFemale: 'u9',
      spirit: SPIRIT_DEFAULT_SCORE,
      spiritP1: SPIRIT_DEFAULT_SCORE,
      spiritP3: 4,
      spiritComment: 'Great game',
    })
  })
})

describe('getLatestPastFixtureId', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('picks the most recent fixture that has already happened', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-10T00:00:00.000Z'))
    expect(
      getLatestPastFixtureId([
        fixture('old', '2026-03-01T00:00:00.000Z'),
        fixture('future', '2026-03-17T00:00:00.000Z'),
        fixture('latest', '2026-03-08T00:00:00.000Z'),
        fixture('invalid', 'not a date'),
      ]),
    ).toBe('latest')
  })

  it('returns undefined when nothing has happened yet', () => {
    expect(getLatestPastFixtureId(undefined)).toBeUndefined()
    expect(getLatestPastFixtureId([])).toBeUndefined()
    expect(
      getLatestPastFixtureId([fixture('future', '2999-01-01T00:00:00.000Z')]),
    ).toBeUndefined()
  })
})

describe('createReportCreatePayload', () => {
  it('needs the teams, fixture and both scores', () => {
    expect(createReportCreatePayload(createReportFormData())).toBeUndefined()
    expect(
      createReportCreatePayload(filled({scoreAgainst: undefined})),
    ).toBeUndefined()
  })

  it('builds the payload and drops MVPs disabled for the season', () => {
    const payload = createReportCreatePayload(
      filled({mvpMale: 'm1', mvpFemale: 'f1', mvpFemale2: 'f2'}),
      season('men'),
    )
    expect(payload).toEqual({
      teamId: 't1',
      teamAgainstId: 't2',
      fixtureId: 'f1',
      scoreFor: 11,
      scoreAgainst: 7,
      mvpMale: 'm1',
      mvpFemale: undefined,
      mvpMale2: undefined,
      mvpFemale2: undefined,
      spirit: SPIRIT_DEFAULT_SCORE,
      spiritComment: '',
      spiritP1: SPIRIT_DEFAULT_SCORE,
      spiritP2: SPIRIT_DEFAULT_SCORE,
      spiritP3: SPIRIT_DEFAULT_SCORE,
      spiritP4: SPIRIT_DEFAULT_SCORE,
      spiritP5: SPIRIT_DEFAULT_SCORE,
    })
  })
})

describe('createReportUpdatePayload', () => {
  it('needs both scores', () => {
    expect(
      createReportUpdatePayload('r1', filled({scoreFor: undefined})),
    ).toBeUndefined()
  })

  it('includes the report id instead of the teams and fixture', () => {
    const payload = createReportUpdatePayload(
      'r1',
      filled({mvpMale: 'm1', mvpFemale: 'f1'}),
      season('women'),
    )
    expect(payload).toMatchObject({
      reportId: 'r1',
      scoreFor: 11,
      scoreAgainst: 7,
      mvpMale: undefined,
      mvpFemale: 'f1',
    })
    expect(payload).not.toHaveProperty('teamId')
  })
})

describe('sanitizeReportFormMvps', () => {
  const users = [
    user('m1', 'male'),
    user('m2', 'male'),
    user('f1', 'female'),
    user('nb', 'non-binary'),
  ]

  it('only applies season slots while players are unknown', () => {
    expect(
      sanitizeReportFormMvps(
        {mvpMale: 'x', mvpFemale: 'y', mvpMale2: 'z', mvpFemale2: 'w'},
        undefined,
        season('women'),
      ),
    ).toEqual({
      mvpMale: undefined,
      mvpFemale: 'y',
      mvpMale2: undefined,
      mvpFemale2: 'w',
    })
  })

  it('drops unknown, ineligible and duplicate picks', () => {
    expect(
      sanitizeReportFormMvps(
        {mvpMale: 'm1', mvpMale2: 'm1', mvpFemale: 'm2', mvpFemale2: 'gone'},
        users,
      ),
    ).toEqual({
      mvpMale: 'm1',
      mvpMale2: undefined,
      mvpFemale: undefined,
      mvpFemale2: undefined,
    })
  })

  it('lets non-binary players fill either slot', () => {
    expect(
      sanitizeReportFormMvps(
        {mvpMale: 'nb', mvpFemale: undefined, mvpFemale2: 'nb'},
        users,
      ),
    ).toMatchObject({mvpMale: 'nb', mvpFemale2: 'nb'})
  })
})

describe('sameMvps', () => {
  it('compares all four MVP fields', () => {
    const a = {mvpMale: 'm1', mvpFemale: 'f1'}
    expect(sameMvps(a, {...a})).toBe(true)
    expect(sameMvps(a, {...a, mvpFemale2: 'f2'})).toBe(false)
  })
})

describe('getReportMvpSlots', () => {
  it('shows one slot per gender without official scoring', () => {
    expect(getReportMvpSlots(season('mixed'), false)).toEqual([
      {field: 'mvpMale', pair: 'mvpMale2', slot: 'male', label: 'MVP Male'},
      {
        field: 'mvpFemale',
        pair: 'mvpFemale2',
        slot: 'female',
        label: 'MVP Female',
      },
    ])
  })

  it('adds 2nd picks with official scoring, limited to the division', () => {
    expect(getReportMvpSlots(season('men'), true).map((s) => s.label)).toEqual([
      'MVP Male 1',
      'MVP Male 2',
    ])
    expect(getReportMvpSlots(undefined, true).map((s) => s.field)).toEqual([
      'mvpMale',
      'mvpMale2',
      'mvpFemale',
      'mvpFemale2',
    ])
  })
})

describe('eligibleMvpUsers', () => {
  it('filters by slot gender and excludes the paired pick', () => {
    const users = [
      user('m1', 'male'),
      user('m2', 'male'),
      user('f1', 'female'),
      user('o1', 'other'),
    ]
    expect(eligibleMvpUsers(users, 'male', 'm2').map((u) => u.id)).toEqual([
      'm1',
      'o1',
    ])
  })
})

describe('validateReportForm', () => {
  it('requires the fixture, teams and scores in order', () => {
    expect(validateReportForm(createReportFormData())).toBe(
      'Fixture is required.',
    )
    expect(validateReportForm(filled({teamId: undefined}))).toBe(
      'Team is required.',
    )
    expect(validateReportForm(filled({againstTeamId: undefined}))).toBe(
      'Opposition team is required.',
    )
    expect(validateReportForm(filled({scoreFor: undefined}))).toBe(
      'Both scores are required.',
    )
  })

  it('accepts a complete simple report', () => {
    expect(validateReportForm(filled())).toBeUndefined()
    expect(validateReportForm(filled({spirit: undefined}))).toBe(
      'Spirit score is required.',
    )
  })

  it('rejects the same player in two MVP slots', () => {
    expect(validateReportForm(filled({mvpMale: 'u1', mvpFemale: 'u1'}))).toBe(
      'The male and female MVP cannot be the same person.',
    )
    expect(
      validateReportForm(filled({mvpMale: 'u1', mvpMale2: 'u1'}), true),
    ).toBe('The 5-point and 3-point male MVPs cannot be the same person.')
    expect(
      validateReportForm(filled({mvpFemale: 'u1', mvpMale2: 'u1'}), true),
    ).toBe(
      'The 5-point female MVP and 3-point male MVP cannot be the same person.',
    )
  })

  it('allows a shared pick when the season has one gender slot', () => {
    expect(
      validateReportForm(
        filled({mvpMale: 'u1', mvpFemale: 'u1'}),
        false,
        season('men'),
      ),
    ).toBeUndefined()
  })

  it('needs every spirit category and a comment for outlying official totals', () => {
    expect(validateReportForm(filled(), true)).toBeUndefined()
    expect(validateReportForm(filled({spiritP4: undefined}), true)).toBe(
      'All five spirit categories must be rated for official scoring.',
    )
    expect(validateReportForm(filled({spiritP1: 4, spiritP2: 4}), true)).toBe(
      'A comment is required when the total spirit score is below 9 or above 11.',
    )
    expect(
      validateReportForm(
        filled({spiritP1: 4, spiritP2: 4, spiritComment: 'Superb'}),
        true,
      ),
    ).toBeUndefined()
  })
})

describe('reportSpiritTotal', () => {
  const report = {
    spirit: 3,
    spiritP1: 1,
    spiritP2: 2,
    spiritP3: 3,
    spiritP4: undefined,
    spiritP5: 4,
  }

  it('sums the categories for official scoring', () => {
    expect(reportSpiritTotal(report, true)).toBe(10)
  })

  it('uses the single score otherwise', () => {
    expect(reportSpiritTotal(report, false)).toBe(3)
    expect(reportSpiritTotal({...report, spirit: undefined}, undefined)).toBe(0)
  })
})

describe('shuffleArray', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffleArray(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect(output).not.toBe(input)
    expect([...output].sort()).toEqual(input)
  })

  it('swaps using Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(shuffleArray(['a', 'b', 'c'])).toEqual(['b', 'c', 'a'])
    random.mockRestore()
  })
})
