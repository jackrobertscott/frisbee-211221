import {badRequestError, conflictError} from '@shared/errors'
import {
  ReportCreateDef,
  ReportDeleteDef,
  ReportMissingListDef,
  ReportUpdateDef,
} from '@shared/endpoints/ReportDef'
import {TTeam} from '@shared/schemas/ioTeam'
import {validateOfficialSpiritComment} from '@shared/utils/reportValidation'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../utils/endpoints'
import {requireAccess} from './requireAccess'
import {requireTeam} from './requireTeam'

function assertOfficialSpiritComment(
  useOfficialScoring: boolean | undefined,
  body: Parameters<typeof validateOfficialSpiritComment>[0],
) {
  if (!useOfficialScoring) {
    return
  }

  const errorMessage = validateOfficialSpiritComment(body)
  if (errorMessage) {
    throw badRequestError(errorMessage, {
      errorCode: 'report.spirit_comment_required',
    })
  }
}

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...ReportCreateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      let team: TTeam
      if (user.admin) team = await $Team.getOne({id: body.teamId})
      else [team] = await requireTeam(user, body.teamId)
      const fixture = await $Fixture.getOne({id: body.fixtureId})
      const season = await $Season.getOne({id: fixture.seasonId})
      const teamAgainst = await $Team.getOne({id: body.againstTeamId})
      assertOfficialSpiritComment(season.useOfficialScoring, body)
      if (
        await $Report.count({
          fixtureId: fixture.id,
          teamId: team.id,
          teamAgainstId: teamAgainst.id,
        })
      ) {
        const message = `Report already submitted by ${team.name} for ${fixture.title}.`
        throw conflictError(message, {
          errorCode: 'report.already_submitted',
        })
      }
      let matchupIsValid = false
      for (const game of fixture.games) {
        if (
          (game.team1Id === team.id && game.team2Id === teamAgainst.id) ||
          (game.team2Id === team.id && game.team1Id === teamAgainst.id)
        ) {
          matchupIsValid = true
          break
        }
      }
      if (!matchupIsValid) {
        const message =
          'Failed to find the opposition team. Your team is may not be playing in this fixture.'
        throw badRequestError(message, {
          errorCode: 'report.matchup_invalid',
        })
      }
      return $Report.createOne({
        ...body,
        userId: user.id,
        teamAgainstId: teamAgainst.id,
      })
    },
  }),

  createEndpoint({
    ...ReportUpdateDef,
    handler:
      ({reportId, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const report = await $Report.getOne({id: reportId})
        const fixture = await $Fixture.getOne({id: report.fixtureId})
        const season = await $Season.getOne({id: fixture.seasonId})
        assertOfficialSpiritComment(season.useOfficialScoring, body)
        return $Report.updateOne(
          {id: reportId},
          {
            ...body,
            updatedOn: new Date().toISOString(),
          },
        )
      },
  }),

  createEndpoint({
    ...ReportDeleteDef,
    handler:
      ({reportId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Report.deleteOne({id: reportId})
      },
  }),

  createEndpoint({
    ...ReportMissingListDef,
    handler:
      ({seasonId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const fixtures = await $Fixture.getMany({seasonId}, {sort: {date: 1}})
        const teams = await $Team.getMany({seasonId})
        const reports = await $Report.getMany({
          fixtureId: {$in: fixtures.map((i) => i.id)},
        })

        // Group fixtures by round (using title as identifier)
        const missingReportsByRound = fixtures.reduce(
          (acc, fixture) => {
            const round = fixture.title
            if (!acc[round]) {
              acc[round] = {
                title: round,
                fixtureId: fixture.id,
                date: fixture.date,
                missingTeams: [],
              }
            }

            // For each game in the fixture, check if both teams have submitted reports
            fixture.games.forEach((game) => {
              const team1 = teams.find((t) => t.id === game.team1Id)
              const team2 = teams.find((t) => t.id === game.team2Id)

              if (team1) {
                const hasReport = reports.some(
                  (r) =>
                    r.fixtureId === fixture.id &&
                    r.teamId === team1.id &&
                    r.teamAgainstId === team2?.id,
                )
                if (
                  !hasReport &&
                  !acc[round].missingTeams.some((t) => t.id === team1.id)
                ) {
                  acc[round].missingTeams.push({
                    id: team1.id,
                    name: team1.name,
                    color: team1.color,
                    againstId: team2?.id,
                    againstName: team2?.name,
                  })
                }
              }

              if (team2) {
                const hasReport = reports.some(
                  (r) =>
                    r.fixtureId === fixture.id &&
                    r.teamId === team2.id &&
                    r.teamAgainstId === team1?.id,
                )
                if (
                  !hasReport &&
                  !acc[round].missingTeams.some((t) => t.id === team2.id)
                ) {
                  acc[round].missingTeams.push({
                    id: team2.id,
                    name: team2.name,
                    color: team2.color,
                    againstId: team1?.id,
                    againstName: team1?.name,
                  })
                }
              }
            })

            return acc
          },
          {} as Record<
            string,
            {
              title: string
              fixtureId: string
              date: string
              missingTeams: Array<{
                id: string
                name: string
                color?: string
                againstId?: string
                againstName?: string
              }>
            }
          >,
        )

        // Convert to array and sort by date
        return Object.values(missingReportsByRound)
          .filter((round) => round.missingTeams.length > 0)
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          )
      },
  }),
])
