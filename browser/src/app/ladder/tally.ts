import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'

const isNumber = (data: unknown): data is number =>
  typeof data === 'number' && !isNaN(data)

export interface TTallyChart {
  teamId: string
  points: number
  wins: number
  loses: number
  draws: number
  for: number
  against: number
  games: number
  ratio: number
  aveFor: number
  aveAgainst: number
}

const emptyChart = (teamId: string): TTallyChart => ({
  teamId,
  points: 0,
  wins: 0,
  loses: 0,
  draws: 0,
  for: 0,
  against: 0,
  games: 0,
  ratio: 0,
  aveFor: 0,
  aveAgainst: 0,
})

export type TTally = Record<string, TTallyChart | undefined>

/** Per-team ladder stats from scored games (grading rounds excluded): win 4, draw 2, loss 0. */
export const tallyChart = (fixtures: TFixture[]) => {
  const tally: TTally = {}
  for (const fixture of fixtures) {
    if (fixture.grading) continue
    for (const game of fixture.games) {
      if (!isNumber(game.team1Score) || !isNumber(game.team2Score)) continue
      const t1Tally = tally[game.team1Id] ?? emptyChart(game.team1Id)
      const t2Tally = tally[game.team2Id] ?? emptyChart(game.team2Id)
      if (game.team1Score > game.team2Score) {
        t1Tally.wins += 1
        t2Tally.loses += 1
        t1Tally.points += 4
      } else if (game.team1Score < game.team2Score) {
        t1Tally.loses += 1
        t2Tally.wins += 1
        t2Tally.points += 4
      } else {
        t1Tally.draws += 1
        t2Tally.draws += 1
        t1Tally.points += 2
        t2Tally.points += 2
      }
      t1Tally.for += game.team1Score
      t2Tally.for += game.team2Score
      t1Tally.against += game.team2Score
      t2Tally.against += game.team1Score
      t1Tally.games += 1
      t2Tally.games += 1
      tally[game.team1Id] = t1Tally
      tally[game.team2Id] = t2Tally
    }
  }
  for (const id in tally) {
    const data = tally[id]
    if (!data) continue
    data.ratio = Math.round((data.for / data.against) * 100) / 100
    data.aveFor = Math.round((data.for / data.games) * 100) / 100
    data.aveAgainst = Math.round((data.against / data.games) * 100) / 100
  }
  return tally
}

export const formatRatioPercent = (ratio: number | undefined) => {
  if (ratio === undefined || !Number.isFinite(ratio)) return undefined
  return `${Math.round(ratio * 100)}%`
}

/** Points desc, then ratio desc (the legacy ladder order). */
export const byLadder = (tally: TTally) => (a: TTeam, b: TTeam) => {
  const pa = tally[a.id]?.points ?? 0
  const pb = tally[b.id]?.points ?? 0
  if (pa !== pb) return pb - pa
  const ra = tally[a.id]?.ratio ?? 0
  const rb = tally[b.id]?.ratio ?? 0
  return ra === rb ? 0 : ra < rb ? 1 : -1
}

/** How often each points total (1…max) was scored, ignoring zero scores. */
export const scoreDistribution = (fixtures: TFixture[]) => {
  const all = fixtures
    .flatMap((f) => f.games.flatMap((g) => [g.team1Score, g.team2Score]))
    .filter((s): s is number => typeof s === 'number' && s !== 0)
  const max = Math.max(0, ...all)
  return Array.from({length: max}, (_, i) => ({
    label: String(i + 1),
    values: {games: all.filter((s) => s === i + 1).length},
  }))
}
