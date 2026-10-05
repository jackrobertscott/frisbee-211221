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
 * Lists, per fixture, the teams that have not reported on a game they played.
 * Each team appears at most once per fixture, fixtures with nothing missing
 * are dropped, and fixtures are ordered by date.
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

  // fixtures are grouped by id: titles can repeat (e.g. a rescheduled round)
  const rounds = new Map<string, TMissingReportRound>()
  fixtures.forEach((fixture) => {
    const round = rounds.get(fixture.id) ?? {
      title: fixture.title,
      fixtureId: fixture.id,
      date: fixture.date,
      missingTeams: [],
    }
    rounds.set(fixture.id, round)

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

  return [...rounds.values()]
    .filter((round) => round.missingTeams.length > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
