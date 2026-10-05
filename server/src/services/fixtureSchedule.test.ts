import {TFixture} from '@shared/schemas/ioFixture'
import {describe, expect, it} from 'vitest'
import {
  assertTeamsCanBeScheduled,
  getHighestRoundNumber,
  groupTeamIdsByDivision,
  planFixtureRounds,
  resolveDivisionTeamOrders,
  shiftFixtureDate,
  shuffleInPlace,
  TShuffle,
} from './fixtureSchedule'
import {getRoundRobinPairings} from './roundRobin'

const keepOrder: TShuffle = (items) => items
const reverseOrder: TShuffle = (items) => items.reverse()

const sequentialIds = () => {
  let next = 0
  return () => `G${++next}`
}

const fixtureOf = (
  title: string,
  pairings: string[][] = [],
  date = '2026-01-01T00:00:00.000Z',
): TFixture => ({
  id: `F-${title}`,
  createdOn: date,
  updatedOn: date,
  seasonId: 'S',
  userId: 'U',
  title,
  date,
  games: pairings.map(([team1Id, team2Id], index) => ({
    id: `${title}-${index}`,
    team1Id,
    team2Id,
    place: 'Field',
    time: '18:00',
  })),
})

const catchError = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('Expected function to throw')
}

describe('shiftFixtureDate', () => {
  const date = new Date(2026, 0, 31, 18, 30).toISOString()
  const local = (iso: string) => {
    const d = new Date(iso)
    return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]
  }

  it('moves forward and backward by days', () => {
    expect(
      local(
        shiftFixtureDate(date, {amount: 3, unit: 'day', direction: 'forward'}),
      ),
    ).toEqual([2026, 2, 3, 18])
    expect(
      local(
        shiftFixtureDate(date, {amount: 3, unit: 'day', direction: 'backward'}),
      ),
    ).toEqual([2026, 1, 28, 18])
  })

  it('moves by weeks of seven days', () => {
    expect(
      local(
        shiftFixtureDate(date, {amount: 2, unit: 'week', direction: 'forward'}),
      ),
    ).toEqual([2026, 2, 14, 18])
  })

  it('moves by calendar months, overflowing like Date#setMonth', () => {
    // 31 Jan + 1 month -> "31 Feb" -> 3 Mar
    expect(
      local(
        shiftFixtureDate(date, {
          amount: 1,
          unit: 'month',
          direction: 'forward',
        }),
      ),
    ).toEqual([2026, 3, 3, 18])
    expect(
      local(
        shiftFixtureDate(date, {
          amount: 2,
          unit: 'month',
          direction: 'backward',
        }),
      ),
    ).toEqual([2025, 12, 1, 18])
  })

  it('leaves the date unchanged for a zero amount', () => {
    expect(
      shiftFixtureDate(date, {amount: 0, unit: 'month', direction: 'backward'}),
    ).toBe(date)
  })
})

describe('assertTeamsCanBeScheduled', () => {
  it('requires every team to have a division', () => {
    expect(
      catchError(() =>
        assertTeamsCanBeScheduled([{division: 1}, {division: undefined}], 10),
      ),
    ).toMatchObject({statusCode: 400, errorCode: 'fixture.division_missing'})
  })

  it('checks divisions before slots', () => {
    expect(
      catchError(() => assertTeamsCanBeScheduled([{}, {}, {}, {}], 0)),
    ).toMatchObject({errorCode: 'fixture.division_missing'})
  })

  it('requires at least (teams - 1) / 2 slots', () => {
    const teams = Array.from({length: 6}, () => ({division: 1}))
    expect(catchError(() => assertTeamsCanBeScheduled(teams, 2))).toMatchObject(
      {statusCode: 400, errorCode: 'fixture.slots_insufficient'},
    )
    expect(() => assertTeamsCanBeScheduled(teams, 3)).not.toThrow()
  })
})

describe('groupTeamIdsByDivision', () => {
  it('groups team ids by division in team order', () => {
    const divisions = groupTeamIdsByDivision([
      {id: 'A', division: 2},
      {id: 'B', division: 1},
      {id: 'C', division: 2},
    ])
    expect([...divisions.entries()]).toEqual([
      [2, ['A', 'C']],
      [1, ['B']],
    ])
  })
})

describe('getHighestRoundNumber', () => {
  it('returns the largest round number among titles', () => {
    expect(
      getHighestRoundNumber([
        {title: 'Round 2'},
        {title: 'Final'},
        {title: 'Round 10'},
        {title: 'Round 3'},
      ]),
    ).toBe(10)
  })

  it('returns undefined when no title has a round number', () => {
    expect(getHighestRoundNumber([])).toBeUndefined()
    expect(getHighestRoundNumber([{title: 'Final'}])).toBeUndefined()
  })
})

describe('resolveDivisionTeamOrders', () => {
  it('shuffles a copy of each division when there are no rounds yet', () => {
    const divisions = new Map([
      [1, ['A', 'B']],
      [2, ['C', 'D']],
    ])
    const orders = resolveDivisionTeamOrders(divisions, [], 3, reverseOrder)
    expect([...orders.entries()]).toEqual([
      [1, ['B', 'A']],
      [2, ['D', 'C']],
    ])
    expect(divisions.get(1)).toEqual(['A', 'B'])
  })

  it('continues the existing rotation for divisions with round games', () => {
    const order = ['A', 'B', 'C', 'D']
    const existing = [
      fixtureOf('Round 1', getRoundRobinPairings(order, 0)),
      fixtureOf('Round 2', getRoundRobinPairings(order, 1)),
    ]
    const divisions = new Map([
      [1, ['E', 'F']],
      [2, ['D', 'C', 'B', 'A']],
    ])
    const orders = resolveDivisionTeamOrders(divisions, existing, 1, keepOrder)
    // reconstructed divisions come first, shuffled ones after
    expect([...orders.keys()]).toEqual([2, 1])
    const resolved = orders.get(2)!
    expect(getRoundRobinPairings(resolved, 2).map((p) => p.sort())).toEqual(
      expect.arrayContaining(
        getRoundRobinPairings(order, 2).map((p) => p.sort()),
      ),
    )
    expect(orders.get(1)).toEqual(['E', 'F'])
  })
})

describe('planFixtureRounds', () => {
  const baseInput = {
    seasonId: 'S',
    userId: 'U',
    startingDate: new Date(2026, 2, 1, 18).toISOString(),
    slots: [
      {id: 's1', place: 'Field 1', time: '18:00'},
      {id: 's2', place: 'Field 2', time: '19:00'},
    ],
  }

  it('builds weekly rounds from the round-robin pairings', () => {
    const fixtures = planFixtureRounds(
      {
        ...baseInput,
        roundCount: 3,
        teams: ['A', 'B', 'C', 'D'].map((id) => ({id, division: 1})),
        existingFixtures: [],
      },
      {shuffle: keepOrder, createGameId: sequentialIds()},
    )
    expect(fixtures.map((f) => f.title)).toEqual([
      'Round 1',
      'Round 2',
      'Round 3',
    ])
    expect(
      fixtures.map(
        (f) =>
          new Date(f.date).getDate() -
          new Date(baseInput.startingDate).getDate(),
      ),
    ).toEqual([0, 7, 14])
    expect(fixtures[0]).toEqual({
      seasonId: 'S',
      userId: 'U',
      title: 'Round 1',
      date: baseInput.startingDate,
      grading: false,
      games: [
        {id: 'G1', team1Id: 'A', team2Id: 'D', place: 'Field 1', time: '18:00'},
        {id: 'G2', team1Id: 'B', team2Id: 'C', place: 'Field 2', time: '19:00'},
      ],
    })
  })

  it('cycles slots across games from every division', () => {
    const [fixture] = planFixtureRounds(
      {
        ...baseInput,
        roundCount: 1,
        teams: [
          {id: 'A', division: 1},
          {id: 'B', division: 1},
          {id: 'C', division: 2},
          {id: 'D', division: 2},
          {id: 'E', division: 2},
          {id: 'F', division: 2},
        ],
        existingFixtures: [],
      },
      {shuffle: keepOrder, createGameId: sequentialIds()},
    )
    expect(fixture.games.map((g) => [g.team1Id, g.team2Id, g.place])).toEqual([
      ['A', 'B', 'Field 1'],
      ['C', 'F', 'Field 2'],
      ['D', 'E', 'Field 1'],
    ])
  })

  it('continues numbering and rotation after existing rounds', () => {
    const order = ['A', 'B', 'C', 'D']
    const fixtures = planFixtureRounds(
      {
        ...baseInput,
        roundCount: 1,
        teams: order.map((id) => ({id, division: 1})),
        existingFixtures: [
          fixtureOf('Round 1', getRoundRobinPairings(order, 0)),
          fixtureOf('Round 2', getRoundRobinPairings(order, 1)),
        ],
      },
      {shuffle: keepOrder, createGameId: sequentialIds()},
    )
    expect(fixtures).toHaveLength(1)
    expect(fixtures[0].title).toBe('Round 3')
    const key = (pairs: string[][]) =>
      pairs.map((p) => [...p].sort().join('-')).sort()
    expect(key(fixtures[0].games.map((g) => [g.team1Id, g.team2Id]))).toEqual(
      key(getRoundRobinPairings(order, 2)),
    )
  })

  it('rejects divisions with an odd number of teams', () => {
    expect(
      catchError(() =>
        planFixtureRounds(
          {
            ...baseInput,
            roundCount: 1,
            teams: ['A', 'B', 'C'].map((id) => ({id, division: 1})),
            existingFixtures: [],
          },
          {shuffle: keepOrder},
        ),
      ),
    ).toMatchObject({statusCode: 400, errorCode: 'fixture.uneven_division'})
  })

  it('uses a random shuffle and random game ids by default', () => {
    const [fixture] = planFixtureRounds({
      ...baseInput,
      roundCount: 1,
      teams: ['A', 'B', 'C', 'D'].map((id) => ({id, division: 1})),
      existingFixtures: [],
    })
    expect(fixture.games).toHaveLength(2)
    expect(
      new Set(fixture.games.flatMap((g) => [g.team1Id, g.team2Id])),
    ).toEqual(new Set(['A', 'B', 'C', 'D']))
    fixture.games.forEach((game) => expect(game.id).toMatch(/^\w{10}$/))
  })
})

describe('shuffleInPlace', () => {
  it('returns the same array holding the same items', () => {
    const items = [1, 2, 3, 4, 5]
    const result = shuffleInPlace(items)
    expect(result).toBe(items)
    expect([...result].sort()).toEqual([1, 2, 3, 4, 5])
  })
})
