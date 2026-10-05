import {ReportMissingListDef} from '@shared/endpoints/ReportDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {TTeam} from '@shared/schemas/ioTeam'
import {TypeIoValue} from '@shared/torva'

export type TMissingReportRound = TypeIoValue<
  typeof ReportMissingListDef.result
>[number]
type TMissingTeam = TMissingReportRound['missingTeams'][number]

export type TSubmittedReport = Pick<TReport, 'fixtureId' | 'teamId'> & {
  teamAgainstId?: string
}

const reportKey = (fixtureId: string, teamId: string, teamAgainstId?: string) =>
  [fixtureId, teamId, teamAgainstId ?? ''].join('\u0000')

/**
 * Lists, per round, the teams that have not reported on a game they played.
 * Fixtures sharing a title are merged into one round (the first fixture's id
 * and date win), each team appears at most once per round, rounds with
 * nothing missing are dropped, and rounds are ordered by date.
 */
export function listMissingReports(
  fixtures: Pick<TFixture, 'id' | 'title' | 'date' | 'games'>[],
  teams: Pick<TTeam, 'id' | 'name' | 'color'>[],
  reports: TSubmittedReport[],
): TMissingReportRound[] {
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const reportKeys = new Set(
    reports.map((r) => reportKey(r.fixtureId, r.teamId, r.teamAgainstId)),
  )

  // A plain object (not a Map) keeps the historical round ordering for ties.
  const rounds: Record<string, TMissingReportRound> = {}
  fixtures.forEach((fixture) => {
    const round = (rounds[fixture.title] ??= {
      title: fixture.title,
      fixtureId: fixture.id,
      date: fixture.date,
      missingTeams: [],
    })

    fixture.games.forEach((game) => {
      const team1 = teamsById.get(game.team1Id)
      const team2 = teamsById.get(game.team2Id)
      const sides = [
        [team1, team2],
        [team2, team1],
      ] as const
      sides.forEach(([team, against]) => {
        if (!team) return
        if (reportKeys.has(reportKey(fixture.id, team.id, against?.id))) return
        if (round.missingTeams.some((t) => t.id === team.id)) return
        const missingTeam: TMissingTeam = {
          id: team.id,
          name: team.name,
          color: team.color,
          againstId: against?.id,
          againstName: against?.name,
        }
        round.missingTeams.push(missingTeam)
      })
    })
  })

  return Object.values(rounds)
    .filter((round) => round.missingTeams.length > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
