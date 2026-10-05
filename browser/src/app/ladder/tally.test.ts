import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {describe, expect, it} from 'vitest'
import {
  byLadder,
  formatRatioPercent,
  scoreDistribution,
  tallyChart,
} from './tally'

type TGame = TFixture['games'][number]

let gameId = 0
const game = (
  team1Id: string,
  team1Score: number | undefined,
  team2Id: string,
  team2Score: number | undefined,
): TGame => ({
  id: `g${++gameId}`,
  team1Id,
  team2Id,
  place: 'Field 1',
  time: '18:00',
  team1Score,
  team2Score,
})

const fixture = (games: TGame[], grading?: boolean): TFixture => ({
  id: `f${++gameId}`,
  createdOn: '2026-01-01T00:00:00.000Z',
  updatedOn: '2026-01-01T00:00:00.000Z',
  seasonId: 's1',
  userId: 'u1',
  title: 'Round',
  date: '2026-01-01T00:00:00.000Z',
  games,
  grading,
})

const team = (id: string): TTeam => ({
  id,
  createdOn: '2026-01-01T00:00:00.000Z',
  updatedOn: '2026-01-01T00:00:00.000Z',
  seasonId: 's1',
  name: id,
  color: 'hsla(0, 100%, 50%, 1)',
})

describe('tallyChart', () => {
  it('scores win 4, draw 2, loss 0 and totals for/against', () => {
    const tally = tallyChart([
      fixture([game('a', 10, 'b', 5), game('c', 7, 'd', 7)]),
      fixture([game('b', 6, 'a', 8)]),
    ])
    expect(tally.a).toEqual({
      teamId: 'a',
      points: 8,
      wins: 2,
      loses: 0,
      draws: 0,
      for: 18,
      against: 11,
      games: 2,
      ratio: 1.64,
      aveFor: 9,
      aveAgainst: 5.5,
    })
    expect(tally.b).toMatchObject({points: 0, wins: 0, loses: 2, games: 2})
    expect(tally.c).toMatchObject({points: 2, draws: 1, ratio: 1})
    expect(tally.d).toMatchObject({points: 2, draws: 1, ratio: 1})
  })

  it('ignores grading rounds and unscored games', () => {
    const tally = tallyChart([
      fixture([game('a', 10, 'b', 0)], true),
      fixture([game('a', undefined, 'b', 3), game('a', NaN, 'b', 3)]),
    ])
    expect(tally).toEqual({})
  })

  it('reports an infinite ratio for a team with nothing against', () => {
    const tally = tallyChart([fixture([game('a', 5, 'b', 0)])])
    expect(tally.a?.ratio).toBe(Infinity)
    expect(tally.b?.ratio).toBe(0)
  })
})

describe('byLadder', () => {
  it('orders by points, then ratio, both descending', () => {
    const tally = tallyChart([
      fixture([
        game('a', 10, 'b', 1),
        game('c', 6, 'd', 5),
        game('e', 3, 'f', 3),
      ]),
    ])
    const order = ['f', 'd', 'c', 'e', 'b', 'a', 'x']
      .map(team)
      .sort(byLadder(tally))
      .map((t) => t.id)
    // e and f tie on both, so they keep their input order.
    expect(order).toEqual(['a', 'c', 'f', 'e', 'd', 'b', 'x'])
  })
})

describe('scoreDistribution', () => {
  it('counts each non-zero score from 1 to the max', () => {
    expect(
      scoreDistribution([
        fixture([game('a', 3, 'b', 1), game('c', 0, 'd', 3)]),
        fixture([game('a', undefined, 'b', 2)]),
      ]),
    ).toEqual([
      {label: '1', values: {games: 1}},
      {label: '2', values: {games: 1}},
      {label: '3', values: {games: 2}},
    ])
  })

  it('is empty without scores', () => {
    expect(scoreDistribution([])).toEqual([])
  })
})

describe('formatRatioPercent', () => {
  it('formats finite ratios as whole percentages', () => {
    expect(formatRatioPercent(1.645)).toBe('165%')
    expect(formatRatioPercent(0)).toBe('0%')
  })

  it('hides missing and infinite ratios', () => {
    expect(formatRatioPercent(undefined)).toBeUndefined()
    expect(formatRatioPercent(Infinity)).toBeUndefined()
    expect(formatRatioPercent(NaN)).toBeUndefined()
  })
})
