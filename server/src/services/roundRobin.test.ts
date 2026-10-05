import {TFixture} from '@shared/schemas/ioFixture'
import {describe, expect, it} from 'vitest'
import {
  extractRoundNumber,
  getDivisionRoundGames,
  getRoundRobinPairings,
  reconstructDivisionTeamOrder,
} from './roundRobin'

const teamsOf = (count: number) =>
  Array.from({length: count}, (_, index) => `T${index + 1}`)

const pairKey = ([a, b]: string[]) => [a, b].sort().join('::')

const roundSignature = (pairings: string[][]) =>
  pairings.map(pairKey).sort().join('|')

/** Observed rounds as stored in fixtures: Round N is round index N - 1 */
const observedRounds = (order: string[], roundCount: number) =>
  new Map(
    Array.from({length: roundCount}, (_, index): [number, string[][]] => [
      index + 1,
      getRoundRobinPairings(order, index),
    ]),
  )

const catchError = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('Expected function to throw')
}

const expectFixtureError = (
  fn: () => unknown,
  errorCode: string,
  message?: string,
) => {
  const error = catchError(fn)
  expect(error).toMatchObject({statusCode: 400, errorCode})
  if (message) expect(error).toMatchObject({message})
}

describe('extractRoundNumber', () => {
  it('reads the number after "Round", case-insensitively', () => {
    expect(extractRoundNumber('Round 3')).toBe(3)
    expect(extractRoundNumber('round   12 (rescheduled)')).toBe(12)
    expect(extractRoundNumber('Semi Final - Round 2')).toBe(2)
  })

  it('returns null for titles without a round number', () => {
    expect(extractRoundNumber('Grand Final')).toBeNull()
    expect(extractRoundNumber('Round')).toBeNull()
    expect(extractRoundNumber('Round1')).toBeNull()
  })
})

describe('getRoundRobinPairings', () => {
  it('pairs a fixed first team against a rotating circle', () => {
    const teams = ['A', 'B', 'C', 'D']
    expect(getRoundRobinPairings(teams, 0)).toEqual([
      ['A', 'D'],
      ['B', 'C'],
    ])
    expect(getRoundRobinPairings(teams, 1)).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ])
    expect(getRoundRobinPairings(teams, 2)).toEqual([
      ['A', 'C'],
      ['D', 'B'],
    ])
  })

  it('swaps home and away on alternate cycles', () => {
    const teams = ['A', 'B', 'C', 'D']
    expect(getRoundRobinPairings(teams, 3)).toEqual([
      ['D', 'A'],
      ['C', 'B'],
    ])
    expect(getRoundRobinPairings(teams, 5)).toEqual([
      ['C', 'A'],
      ['B', 'D'],
    ])
    expect(getRoundRobinPairings(teams, 6)).toEqual(
      getRoundRobinPairings(teams, 0),
    )
  })

  it('does not mutate the input', () => {
    const teams = ['A', 'B', 'C', 'D']
    getRoundRobinPairings(teams, 2)
    expect(teams).toEqual(['A', 'B', 'C', 'D'])
  })

  for (const count of [2, 3, 4, 5, 6, 7, 8, 10]) {
    it(`covers every pairing exactly once per cycle for ${count} teams`, () => {
      const teams = teamsOf(count)
      const roundsPerCycle = count % 2 === 0 ? count - 1 : count
      const gamesPerRound = Math.floor(count / 2)

      for (let cycle = 0; cycle < 3; cycle++) {
        const seen = new Map<string, number>()
        for (let r = 0; r < roundsPerCycle; r++) {
          const round = cycle * roundsPerCycle + r
          const pairings = getRoundRobinPairings(teams, round)
          expect(pairings).toHaveLength(gamesPerRound)
          const playing = pairings.flat()
          expect(new Set(playing).size).toBe(playing.length)
          expect(playing.every((team) => teams.includes(team))).toBe(true)
          for (const [home, away] of pairings) {
            expect(home).not.toBe(away)
            const key = pairKey([home, away])
            seen.set(key, (seen.get(key) ?? 0) + 1)
            // which side is home flips each cycle
            const reference = getRoundRobinPairings(teams, r).find(
              (pair) => pairKey(pair) === key,
            )
            expect(reference).toBeDefined()
            if (cycle % 2 === 0) expect([home, away]).toEqual(reference)
            else expect([away, home]).toEqual(reference)
          }
        }
        expect(seen.size).toBe((count * (count - 1)) / 2)
        expect([...seen.values()].every((value) => value === 1)).toBe(true)
      }
    })
  }

  it('gives each team in an odd division one bye per cycle', () => {
    const teams = teamsOf(5)
    const byes = new Map<string, number>()
    for (let round = 0; round < 5; round++) {
      const playing = new Set(getRoundRobinPairings(teams, round).flat())
      teams
        .filter((team) => !playing.has(team))
        .forEach((team) => byes.set(team, (byes.get(team) ?? 0) + 1))
    }
    expect(Object.fromEntries(byes)).toEqual({
      T1: 1,
      T2: 1,
      T3: 1,
      T4: 1,
      T5: 1,
    })
  })

  it('returns no games for a single team', () => {
    expect(getRoundRobinPairings(['A'], 0)).toEqual([])
  })

  it('returns no games for no teams', () => {
    expect(getRoundRobinPairings([], 0)).toEqual([])
    expect(getRoundRobinPairings([], 3)).toEqual([])
  })
})

describe('getDivisionRoundGames', () => {
  const fixture = (
    title: string,
    games: Array<[string, string]>,
  ): TFixture => ({
    id: title,
    createdOn: '2024-01-01T00:00:00.000Z',
    updatedOn: '2024-01-01T00:00:00.000Z',
    seasonId: 's1',
    userId: 'u1',
    title,
    date: '2024-01-01T00:00:00.000Z',
    games: games.map(([team1Id, team2Id], index) => ({
      id: `${title}-${index}`,
      team1Id,
      team2Id,
      place: 'Field 1',
      time: '6pm',
    })),
  })

  const division = new Set(['A', 'B', 'C', 'D'])

  it('groups division-only games by round number', () => {
    const rounds = getDivisionRoundGames(
      [
        fixture('Round 1', [
          ['A', 'B'],
          ['C', 'D'],
          ['E', 'F'],
        ]),
        fixture('round 2 - catch up', [
          ['A', 'C'],
          ['B', 'E'],
        ]),
      ],
      division,
    )
    expect([...rounds.entries()]).toEqual([
      [
        1,
        [
          ['A', 'B'],
          ['C', 'D'],
        ],
      ],
      [2, [['A', 'C']]],
    ])
  })

  it('ignores fixtures without a round number or division games', () => {
    const rounds = getDivisionRoundGames(
      [
        fixture('Grand Final', [['A', 'B']]),
        fixture('Round1', [['A', 'B']]),
        fixture('Round 3', [['E', 'F']]),
      ],
      division,
    )
    expect(rounds.size).toBe(0)
  })

  it('merges fixtures sharing a round number', () => {
    const rounds = getDivisionRoundGames(
      [
        fixture('Round 4', [['A', 'B']]),
        fixture('ROUND   4 late', [['C', 'D']]),
      ],
      division,
    )
    expect(rounds.get(4)).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ])
  })

  it('reads the first round number in the title', () => {
    const rounds = getDivisionRoundGames(
      [fixture('Round 12 (was Round 11)', [['A', 'B']])],
      division,
    )
    expect([...rounds.keys()]).toEqual([12])
  })
})

describe('reconstructDivisionTeamOrder', () => {
  const expectReproduces = (
    order: string[],
    rounds: Map<number, string[][]>,
  ) => {
    rounds.forEach((pairings, roundNumber) => {
      expect(
        roundSignature(getRoundRobinPairings(order, roundNumber - 1)),
      ).toBe(roundSignature(pairings))
    })
  }

  it('reconstructs a two-team order from round one', () => {
    const rounds = new Map([[1, [['B', 'A']]]])
    expect(reconstructDivisionTeamOrder(['A', 'B'], rounds, 1)).toEqual([
      'B',
      'A',
    ])
  })

  it('builds a canonical order from a single observed round', () => {
    const rounds = new Map([
      [
        1,
        [
          ['D', 'A'],
          ['C', 'B'],
        ],
      ],
    ])
    const order = reconstructDivisionTeamOrder(['A', 'B', 'C', 'D'], rounds, 3)
    expect(order).toEqual(['A', 'B', 'C', 'D'])
    expectReproduces(order, rounds)
  })

  for (const count of [4, 6, 8, 10]) {
    for (const roundCount of [2, 3, count - 1, count + 1]) {
      it(`recovers an order reproducing ${roundCount} observed rounds for ${count} teams`, () => {
        const original = teamsOf(count).reverse()
        const rounds = observedRounds(original, roundCount)
        const divisionTeams = teamsOf(count)
        const order = reconstructDivisionTeamOrder(divisionTeams, rounds, 4)
        expect([...order].sort()).toEqual([...divisionTeams].sort())
        expectReproduces(order, rounds)
        if (roundCount >= count - 1) {
          // a full observed cycle pins down the schedule, so future rounds match
          for (let round = roundCount; round < roundCount + 4; round++) {
            expect(roundSignature(getRoundRobinPairings(order, round))).toBe(
              roundSignature(getRoundRobinPairings(original, round)),
            )
          }
        } else {
          // partial cycles are ambiguous: the chosen order may schedule the
          // remaining rounds differently from the original, but never repeats
          // a pairing within the cycle
          const played = new Set(
            [...rounds.values()].flat().map((pair) => pairKey(pair)),
          )
          for (let round = roundCount; round < count - 1; round++) {
            for (const pair of getRoundRobinPairings(order, round)) {
              expect(played.has(pairKey(pair))).toBe(false)
            }
          }
        }
      })
    }
  }

  it('picks a deterministic order when observed rounds are ambiguous', () => {
    const original = ['T6', 'T5', 'T4', 'T3', 'T2', 'T1']
    const rounds = observedRounds(original, 2)
    expect(reconstructDivisionTeamOrder(teamsOf(6), rounds, 4)).toEqual([
      'T5',
      'T6',
      'T3',
      'T4',
      'T1',
      'T2',
    ])
  })

  it('is independent of the division team order and home/away sides', () => {
    const original = ['C', 'F', 'A', 'E', 'B', 'D']
    const rounds = observedRounds(original, 3)
    const flipped = new Map(
      [...rounds.entries()].map(([round, pairings]): [number, string[][]] => [
        round,
        pairings.map(([a, b]) => [b, a]).reverse(),
      ]),
    )
    const first = reconstructDivisionTeamOrder(
      ['A', 'B', 'C', 'D', 'E', 'F'],
      rounds,
      2,
    )
    const second = reconstructDivisionTeamOrder(
      ['F', 'E', 'D', 'C', 'B', 'A'],
      flipped,
      2,
    )
    expect(second).toEqual(first)
    expectReproduces(first, rounds)
  })

  it('rejects odd divisions', () => {
    expectFixtureError(
      () => reconstructDivisionTeamOrder(['A', 'B', 'C'], new Map(), 1),
      'fixture.uneven_division',
    )
  })

  it('rejects rounds that do not start at Round 1', () => {
    expectFixtureError(
      () => reconstructDivisionTeamOrder(['A', 'B'], new Map(), 1),
      'fixture.round_robin_invalid',
      'Fixture generation failed: existing round-robin fixtures must start at Round 1.',
    )
    expectFixtureError(
      () =>
        reconstructDivisionTeamOrder(
          ['A', 'B'],
          new Map([[2, [['A', 'B']]]]),
          1,
        ),
      'fixture.round_robin_invalid',
      'Fixture generation failed: existing round-robin fixtures must start at Round 1.',
    )
  })

  it('rejects gaps between rounds', () => {
    const rounds = observedRounds(['A', 'B', 'C', 'D'], 3)
    rounds.delete(2)
    expectFixtureError(
      () => reconstructDivisionTeamOrder(['A', 'B', 'C', 'D'], rounds, 1),
      'fixture.round_robin_invalid',
      'Fixture generation failed: existing round-robin fixtures are missing Round 2.',
    )
  })

  it('rejects rounds with the wrong number of games', () => {
    expectFixtureError(
      () =>
        reconstructDivisionTeamOrder(
          ['A', 'B', 'C', 'D'],
          new Map([[1, [['A', 'B']]]]),
          1,
        ),
      'fixture.round_robin_invalid',
      'Fixture generation failed: Round 1 does not contain the expected number of division games.',
    )
  })

  it('rejects teams outside the division', () => {
    expectFixtureError(
      () =>
        reconstructDivisionTeamOrder(
          ['A', 'B', 'C', 'D'],
          new Map([
            [
              1,
              [
                ['A', 'B'],
                ['C', 'X'],
              ],
            ],
          ]),
          1,
        ),
      'fixture.round_robin_invalid',
      'Fixture generation failed: Round 1 includes a team outside the current division.',
    )
  })

  it('rejects teams playing themselves', () => {
    expectFixtureError(
      () =>
        reconstructDivisionTeamOrder(
          ['A', 'B', 'C', 'D'],
          new Map([
            [
              1,
              [
                ['A', 'A'],
                ['C', 'D'],
              ],
            ],
          ]),
          1,
        ),
      'fixture.round_robin_invalid',
      'Fixture generation failed: Round 1 includes a team playing itself.',
    )
  })

  it('rejects teams scheduled twice in a round', () => {
    expectFixtureError(
      () =>
        reconstructDivisionTeamOrder(
          ['A', 'B', 'C', 'D'],
          new Map([
            [
              1,
              [
                ['A', 'B'],
                ['A', 'C'],
              ],
            ],
          ]),
          1,
        ),
      'fixture.round_robin_invalid',
      'Fixture generation failed: Round 1 schedules the same team more than once in this division.',
    )
  })

  it('rejects rounds that do not follow the round-robin pattern', () => {
    const round: string[][] = [
      ['A', 'B'],
      ['C', 'D'],
    ]
    expectFixtureError(
      () =>
        reconstructDivisionTeamOrder(
          ['A', 'B', 'C', 'D'],
          new Map([
            [1, round],
            [2, round],
          ]),
          1,
        ),
      'fixture.round_robin_invalid',
      'Fixture generation failed: existing fixtures do not match the expected round-robin pattern.',
    )
  })

  it('accepts later rounds for a two-team division', () => {
    // two-team divisions only consider round one; Round 2 is the swapped pairing
    const order = reconstructDivisionTeamOrder(
      ['A', 'B'],
      new Map([
        [1, [['A', 'B']]],
        [2, [['B', 'A']]],
      ]),
      1,
    )
    expect(order).toEqual(['A', 'B'])
  })
})
