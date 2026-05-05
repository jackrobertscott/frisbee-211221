import {badRequestError, conflictError} from '@shared/errors'
import {
  ReportCreateDef,
  ReportDeleteDef,
  ReportGetFixtureAgainstDef,
  ReportListOfFixtureDef,
  ReportListOfSeasonDef,
  ReportMissingListDef,
  ReportSearchOfSeasonDef,
  ReportUpdateDef,
  TReportSearchRow,
} from '@shared/endpoints/ReportDef'
import {TTeam} from '@shared/schemas/ioTeam'
import {validateOfficialSpiritComment} from '@shared/utils/reportValidation'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import {requireAccess} from './requireAccess'
import {requireTeam} from './requireTeam'

function assertOfficialSpiritComment(
  useOfficialScoring: boolean | undefined,
  body: Parameters<typeof validateOfficialSpiritComment>[0]
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

function createReportSearchPipeline({
  seasonId,
  search,
  limit,
  skip,
}: {
  seasonId: string
  search?: string
  limit?: number
  skip?: number
}) {
  const trimmedSearch = search?.trim()
  const pipeline: Record<string, any>[] = [
    {
      $lookup: {
        from: 'fixture',
        localField: 'fixtureId',
        foreignField: 'id',
        as: 'fixture',
      },
    },
    {$unwind: '$fixture'},
    {$match: {'fixture.seasonId': seasonId}},
    {
      $lookup: {
        from: 'team',
        localField: 'teamId',
        foreignField: 'id',
        as: 'team',
      },
    },
    {
      $unwind: {
        path: '$team',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'team',
        localField: 'teamAgainstId',
        foreignField: 'id',
        as: 'againstTeam',
      },
    },
    {
      $unwind: {
        path: '$againstTeam',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'user',
        localField: 'userId',
        foreignField: 'id',
        as: 'submitter',
      },
    },
    {
      $unwind: {
        path: '$submitter',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        submitterName: {
          $trim: {
            input: {
              $concat: [
                {$ifNull: ['$submitter.firstName', '']},
                ' ',
                {$ifNull: ['$submitter.lastName', '']},
              ],
            },
          },
        },
      },
    },
  ]

  if (trimmedSearch) {
    const searchRegex = regex.escape(trimmedSearch)
    pipeline.push({
      $match: {
        $or: [
          {'fixture.title': {$regex: searchRegex, $options: 'i'}},
          {'team.name': {$regex: searchRegex, $options: 'i'}},
          {'againstTeam.name': {$regex: searchRegex, $options: 'i'}},
          {submitterName: {$regex: searchRegex, $options: 'i'}},
          {userId: {$regex: searchRegex, $options: 'i'}},
          {spiritComment: {$regex: searchRegex, $options: 'i'}},
        ],
      },
    })
  }

  pipeline.push({
    $facet: {
      meta: [{$count: 'count'}],
      reports: [
        {$sort: {createdOn: -1}},
        ...(skip ? [{$skip: skip}] : []),
        ...(limit !== undefined ? [{$limit: limit}] : []),
        {
          $project: {
            _id: 0,
            report: {
              id: '$id',
              createdOn: '$createdOn',
              updatedOn: '$updatedOn',
              teamId: '$teamId',
              teamAgainstId: '$teamAgainstId',
              fixtureId: '$fixtureId',
              userId: {$ifNull: ['$userId', '$$REMOVE']},
              scoreFor: '$scoreFor',
              scoreAgainst: '$scoreAgainst',
              mvpMale: {$ifNull: ['$mvpMale', '$$REMOVE']},
              mvpMale2: {$ifNull: ['$mvpMale2', '$$REMOVE']},
              mvpFemale: {$ifNull: ['$mvpFemale', '$$REMOVE']},
              mvpFemale2: {$ifNull: ['$mvpFemale2', '$$REMOVE']},
              spirit: {$ifNull: ['$spirit', '$$REMOVE']},
              spiritComment: '$spiritComment',
              spiritP1: {$ifNull: ['$spiritP1', '$$REMOVE']},
              spiritP2: {$ifNull: ['$spiritP2', '$$REMOVE']},
              spiritP3: {$ifNull: ['$spiritP3', '$$REMOVE']},
              spiritP4: {$ifNull: ['$spiritP4', '$$REMOVE']},
              spiritP5: {$ifNull: ['$spiritP5', '$$REMOVE']},
            },
            fixtureTitle: {$ifNull: ['$fixture.title', '$fixtureId']},
            teamName: {$ifNull: ['$team.name', '$teamId']},
            teamColor: {$ifNull: ['$team.color', '$$REMOVE']},
            againstName: {$ifNull: ['$againstTeam.name', '$teamAgainstId']},
            againstColor: {$ifNull: ['$againstTeam.color', '$$REMOVE']},
            submitterName: {
              $cond: [
                {$gt: [{$strLenCP: '$submitterName'}, 0]},
                '$submitterName',
                {$ifNull: ['$userId', '...']},
              ],
            },
          },
        },
      ],
    },
  })

  pipeline.push({
    $project: {
      count: {$ifNull: [{$arrayElemAt: ['$meta.count', 0]}, 0]},
      reports: '$reports',
    },
  })

  return pipeline
}

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...ReportListOfFixtureDef,
    handler:
      ({fixtureId, limit}, access) =>
      async (req) => {
        await requireAccess(req, access)
        return $Report.getMany({fixtureId}, {limit, sort: {createdOn: -1}})
      },
  }),

  createEndpoint({
    ...ReportListOfSeasonDef,
    handler:
      ({seasonId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const fixtures = await $Fixture.getMany({seasonId})
        const query = {fixtureId: {$in: fixtures.map((i) => i.id)}}
        const [count, reports] = await Promise.all([
          $Report.count(query),
          $Report.getMany(query, {sort: {createdOn: -1}}),
        ])
        return {count, reports, fixtures}
      },
  }),

  createEndpoint({
    ...ReportSearchOfSeasonDef,
    handler:
      ({seasonId, search, limit, skip}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Season.getOne({id: seasonId})
        const [result] = (await $Report.aggregate(
          createReportSearchPipeline({seasonId, search, limit, skip})
        )) as Array<{count: number; reports: TReportSearchRow[]}>
        return result ?? {count: 0, reports: []}
      },
  }),

  createEndpoint({
    ...ReportGetFixtureAgainstDef,
    handler:
      ({teamId, fixtureId}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
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
          throw badRequestError(message, {
            errorCode: 'report.matchup_invalid',
          })
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
          }
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
