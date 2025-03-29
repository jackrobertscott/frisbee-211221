import {ReportCreateDef, ReportDeleteDef, ReportGetFixtureAgainstDef, ReportListOfFixtureDef, ReportListOfSeasonDef, ReportMissingListDef, ReportUpdateDef} from '@shared/endpoints/ReportDef'
import {TTeam} from '@shared/schemas/ioTeam'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {requireTeam} from './requireTeam'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'
/**
 *
 */
export default new Map<string, RequestHandler>([
  /**
   *
   */
  createEndpoint({
    ...ReportListOfFixtureDef,
    handler:
      ({fixtureId, limit}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Report.getMany({fixtureId}, {limit, sort: {createdOn: -1}})
      },
  }),
  /**
   *
   */
  createEndpoint({
    ...ReportListOfSeasonDef,
    handler:
      ({seasonId}) =>
      async (req) => {
        await requireUserAdmin(req)
        const fixtures = await $Fixture.getMany({seasonId})
        const query = {fixtureId: {$in: fixtures.map((i) => i.id)}}
        const [count, reports] = await Promise.all([
          $Report.count(query),
          $Report.getMany(query, {sort: {createdOn: -1}}),
        ])
        return {count, reports, fixtures}
      },
  }),
  /**
   *
   */
  createEndpoint({
    ...ReportGetFixtureAgainstDef,
    handler:
      ({teamId, fixtureId}) =>
      async (req) => {
        const [user] = await requireUser(req)
        let team: TTeam
        if (user.admin) team = await $Team.getOne({id: teamId})
        else [team] = await requireTeam(user, teamId)
        const fixture = await $Fixture.getOne({id: fixtureId})
        let againstTeamIds: string[] = []
        for (const game of fixture.games) {
          if (game.team1Id === team.id) {
            againstTeamIds.push(game.team2Id)
          } else if (game.team2Id === team.id) {
            againstTeamIds.push(game.team1Id)
          }
        }
        if (!againstTeamIds.length) {
          const message =
            'Failed to find the opposition team. Your team is may not be playing in this fixture.'
          throw new Error(message)
        }
        return Promise.all(
          againstTeamIds.map(async (id) => {
            const againstTeam = await $Team.getOne({id})
            const againstMembers = await $Member.getMany({
              teamId: againstTeam.id,
            })
            const againstUsers = await $User.getMany({
              id: {$in: againstMembers.map((i) => i.userId)},
            })
            return {
              team: againstTeam,
              users: againstUsers,
            }
          })
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    ...ReportCreateDef,
    handler: (body) => async (req) => {
      const [user] = await requireUser(req)
      let team: TTeam
      if (user.admin) team = await $Team.getOne({id: body.teamId})
      else [team] = await requireTeam(user, body.teamId)
      const fixture = await $Fixture.getOne({id: body.fixtureId})
      const teamAgainst = await $Team.getOne({id: body.againstTeamId})
      if (
        await $Report.count({
          fixtureId: fixture.id,
          teamId: team.id,
          teamAgainstId: teamAgainst.id,
        })
      ) {
        const message = `Report already submitted by ${team.name} for ${fixture.title}.`
        throw new Error(message)
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
        throw new Error(message)
      }
      return $Report.createOne({
        ...body,
        userId: user.id,
        teamAgainstId: teamAgainst.id,
      })
    },
  }),
  /**
   *
   */
  createEndpoint({
    ...ReportUpdateDef,
    handler:
      ({reportId, ...body}) =>
      async (req) => {
        await requireUserAdmin(req)
        return $Report.updateOne(
          {id: reportId},
          {
            ...body,
            updatedOn: new Date().toISOString(),
          }
        )
      },
  }),
  /**
   *
   */
  createEndpoint({
    ...ReportDeleteDef,
    handler:
      ({reportId}) =>
      async (req) => {
        await requireUserAdmin(req)
        await $Report.deleteOne({id: reportId})
      },
  }),
  /**
   *
   */
  createEndpoint({
    ...ReportMissingListDef,
    handler:
      ({seasonId}) =>
      async (req) => {
        await requireUserAdmin(req)
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
                    r.teamAgainstId === team2?.id
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
                    r.teamAgainstId === team1?.id
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
          >
        )

        // Convert to array and sort by date
        return Object.values(missingReportsByRound)
          .filter((round) => round.missingTeams.length > 0)
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          )
      },
  }),
])