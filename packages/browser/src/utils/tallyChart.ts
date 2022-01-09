import {TFixture} from '../schemas/ioFixture'
import {isNumber} from './coerce'
/**
 *
 */
interface TChart {
  teamId: string
  points: number
  wins: number
  loses: number
  draws: number
  for: number
  against: number
  games: number
}
/**
 *
 */
const emptyChart = (teamId: string): TChart => ({
  teamId,
  points: 0,
  wins: 0,
  loses: 0,
  draws: 0,
  for: 0,
  against: 0,
  games: 0,
})
/**
 *
 */
export const tallyChart = (rounds: TFixture[]) => {
  const tally: Record<string, TChart | undefined> = {}
  for (const fixture of rounds) {
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
  return tally
}
