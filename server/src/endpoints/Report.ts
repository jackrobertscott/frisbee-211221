import {badRequestError, conflictError} from '@shared/errors'
import {
  ReportCreateDef,
  ReportDeleteDef,
  ReportMissingListDef,
  ReportUpdateDef,
} from '@shared/endpoints/ReportDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {validateOfficialSpiritComment} from '@shared/utils/reportValidation'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {createEndpoint} from '../http/createEndpoint'
import {requireAccess} from '../auth/requireAccess'
import {requireTeam} from '../auth/requireTeam'
import {listMissingReports, TSubmittedReport} from '../services/missingReports'
import {sanitizeReportMvps} from '../services/reportMvps'

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

function fixtureHasMatchup(
  fixture: TFixture,
  teamId: string,
  teamAgainstId: string,
): boolean {
  return fixture.games.some(
    (game) =>
      (game.team1Id === teamId && game.team2Id === teamAgainstId) ||
      (game.team2Id === teamId && game.team1Id === teamAgainstId),
  )
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
      const teamAgainst = await $Team.getOne({id: body.teamAgainstId})
      const reportBody = {
        ...body,
        ...(await sanitizeReportMvps(season, body)),
      }
      assertOfficialSpiritComment(season.useOfficialScoring, reportBody)
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
      if (!fixtureHasMatchup(fixture, team.id, teamAgainst.id)) {
        const message =
          'Failed to find the opposition team. Your team is may not be playing in this fixture.'
        throw badRequestError(message, {
          errorCode: 'report.matchup_invalid',
        })
      }
      return $Report.createOne({
        ...reportBody,
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
        const reportBody = {
          ...body,
          ...(await sanitizeReportMvps(season, body)),
        }
        // spirit parts left out of the update keep their stored values
        assertOfficialSpiritComment(season.useOfficialScoring, {
          ...report,
          ...reportBody,
        })
        return $Report.updateOne(
          {id: reportId},
          {
            ...reportBody,
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
        const [fixtures, teams] = await Promise.all([
          $Fixture.getMany({seasonId}, {sort: {date: 1}}),
          $Team.getMany({seasonId}),
        ])
        const reports = await $Report.aggregate<TSubmittedReport>([
          {$match: {fixtureId: {$in: fixtures.map((i) => i.id)}}},
          {$project: {_id: 0, fixtureId: 1, teamId: 1, teamAgainstId: 1}},
        ])
        return listMissingReports(fixtures, teams, reports)
      },
  }),
])
