import {badRequestError} from '@shared/errors'
import {
  FeatureCompetitionLoadDef,
  FeatureDashboardMvpLoadDef,
  FEATURE_SPIRIT_SORT_KEYS,
  FEATURE_SORT_DIRECTIONS,
  FeatureDashboardReportsLoadDef,
  FeatureDashboardSpiritLoadDef,
  FeatureDashboardTeamsLoadDef,
  FeatureDashboardUserMembershipsLoadDef,
  FeatureFixtureSetupLoadDef,
  FeatureFixtureTallyLoadDef,
  FeatureFixtureViewLoadDef,
  FeatureReportEditorLoadDef,
  FeatureTeamSetupLoadDef,
  TFeatureMvpRow,
  TFeatureSpiritRow,
} from '@shared/endpoints/FeatureDef'
import {
  TTeamListSortDirection,
  TTeamListSortKey,
} from '@shared/endpoints/TeamDef'
import {TReportSearchRow} from '@shared/endpoints/ReportDef'
import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {
  getSeasonMvpSlots,
  isSeasonMvpSlotEnabled,
} from '@shared/utils/seasonGenderDivision'
import {Document} from 'mongodb'
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
import {selectPublicUserFields} from './userPublic'

const TEAM_DEFAULT_SORT_BY: TTeamListSortKey = 'division'
const TEAM_DEFAULT_SORT_DIRECTION: TTeamListSortDirection = 'asc'
const SPIRIT_SCORER_BIAS_SHRINKAGE_REPORTS = 3

type TSpiritAggregate = {
  received?: Array<{_id: string; spirit: number; reports: number}>
  allocated?: Array<{_id: string; spirit: number; reports: number}>
  reports?: TSpiritReportAggregateRow[]
}

type TSpiritReportAggregateRow = {
  teamId: string
  teamAgainstId: string
  spirit: number
}

type TSpiritReportStats = {
  spirit: number
  reports: number
}

type TMvpAggregateRow = {
  userId: string
  votes: number
  maleVotes: number
  femaleVotes: number
  teamId?: string
}

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...FeatureCompetitionLoadDef,
    handler:
      ({seasonId}) =>
      async () => {
        await $Season.getOne({id: seasonId})
        const [teams, fixtures] = await Promise.all([
          _getSeasonTeams(seasonId),
          _getSeasonFixtures(seasonId),
        ])
        return {teams, fixtures}
      },
  }),

  createEndpoint({
    ...FeatureDashboardTeamsLoadDef,
    handler:
      ({seasonId, search, sortBy, sortDirection, skip, limit}) =>
      async () => {
        await $Season.getOne({id: seasonId})
        const query = {
          seasonId,
          name: regex.from(search ?? ''),
        }
        const resolvedSortBy = sortBy ?? TEAM_DEFAULT_SORT_BY
        const resolvedSortDirection =
          sortDirection ?? TEAM_DEFAULT_SORT_DIRECTION
        const [count, teams] = await Promise.all([
          $Team.count(query),
          $Team.aggregate(
            _getTeamListPipeline(
              query,
              resolvedSortBy,
              resolvedSortDirection,
              skip,
              limit,
            ),
          ),
        ])
        return {count, teams}
      },
  }),

  createEndpoint({
    ...FeatureDashboardReportsLoadDef,
    handler:
      ({seasonId, search, limit, skip}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const season = await $Season.getOne({id: seasonId})
        const fixtures = await _getSeasonFixtures(seasonId)
        const [searchResult, teams] = await Promise.all([
          _getReportSearchResult({
            fixtureIds: fixtures.map((fixture) => fixture.id),
            season,
            search,
            limit,
            skip,
          }),
          _getSeasonTeams(seasonId),
        ])
        return {
          ...searchResult,
          fixtures,
          teams,
        }
      },
  }),

  createEndpoint({
    ...FeatureReportEditorLoadDef,
    handler:
      ({seasonId, fixtureId, teamId}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        const [season, fixtures, teams] = await Promise.all([
          $Season.getOne({id: seasonId}),
          _getSeasonFixtures(seasonId),
          _getSeasonTeams(seasonId),
        ])
        let againstOptions: Awaited<ReturnType<typeof _getAgainstOptions>> = []
        if (fixtureId && teamId) {
          againstOptions = await _getAgainstOptions({
            user,
            seasonId: season.id,
            fixtureId,
            teamId,
          })
        }
        return {fixtures, teams, againstOptions}
      },
  }),

  createEndpoint({
    ...FeatureDashboardSpiritLoadDef,
    handler:
      ({seasonId, sortBy, sortDirection}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const season = await $Season.getOne({id: seasonId})
        const [teams, fixtures] = await Promise.all([
          _getSeasonTeams(seasonId),
          _getSeasonFixtures(seasonId),
        ])
        const [aggregate] = await $Report.aggregate<TSpiritAggregate>(
          _createSpiritAggregatePipeline(
            fixtures.map((fixture) => fixture.id),
            !!season.useOfficialScoring,
          ),
        )
        const receivedMap = new Map(
          (aggregate?.received ?? []).map((row) => [row._id, row]),
        )
        const allocatedMap = new Map(
          (aggregate?.allocated ?? []).map((row) => [row._id, row]),
        )
        const adjustedSpiritMaps = _getAdjustedSpiritMaps(
          aggregate?.reports ?? [],
        )
        const rows = teams.map((team) => {
          const received = receivedMap.get(team.id)
          const allocated = allocatedMap.get(team.id)
          const receivedSpirit = received?.spirit ?? 0
          const receivedReports = received?.reports ?? 0
          const allocatedSpirit = allocated?.spirit ?? 0
          const allocatedReports = allocated?.reports ?? 0
          const receivedAverage =
            receivedReports > 0 ? receivedSpirit / receivedReports : 0
          const allocatedAverage =
            allocatedReports > 0 ? allocatedSpirit / allocatedReports : 0
          const adjustedReceivedAverage =
            adjustedSpiritMaps.receivedAverageMap.get(team.id) ?? 0
          const adjustedAllocatedAverage =
            adjustedSpiritMaps.allocatedAverageMap.get(team.id) ?? 0
          return {
            team,
            receivedSpirit,
            receivedReports,
            receivedAverage,
            adjustedReceivedAverage,
            allocatedSpirit,
            allocatedReports,
            allocatedAverage,
            adjustedAllocatedAverage,
            averageDifference:
              receivedReports > 0 && allocatedReports > 0
                ? allocatedAverage - receivedAverage
                : 0,
            adjustedDifference:
              receivedReports > 0 && allocatedReports > 0
                ? adjustedAllocatedAverage - adjustedReceivedAverage
                : 0,
          }
        })
        return {
          rows: _sortSpiritRows(
            rows,
            sortBy ?? 'adjustedReceivedAverage',
            sortDirection ?? 'desc',
          ),
        }
      },
  }),

  createEndpoint({
    ...FeatureDashboardMvpLoadDef,
    handler:
      ({seasonId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const season = await $Season.getOne({id: seasonId})
        const [teams, fixtures] = await Promise.all([
          _getSeasonTeams(seasonId),
          _getSeasonFixtures(seasonId),
        ])
        const aggregateRows = await $Report.aggregate<TMvpAggregateRow>(
          _createMvpAggregatePipeline(
            fixtures.map((fixture) => fixture.id),
            !!season.useOfficialScoring,
            season,
          ),
        )
        const teamMap = new Map(teams.map((team) => [team.id, team]))
        const users = await $User.getMany({
          id: {$in: aggregateRows.map((row) => row.userId)},
        })
        const userMap = new Map(
          users.map((user) => [user.id, selectPublicUserFields(user)]),
        )
        const slots = getSeasonMvpSlots(season)
        const result: TFeatureMvpRow[] = aggregateRows
          .map((row) => {
            const user = userMap.get(row.userId)
            const team = row.teamId ? teamMap.get(row.teamId) : undefined
            const maleVotes = row.maleVotes ?? 0
            const femaleVotes = row.femaleVotes ?? 0
            return {
              userId: row.userId,
              userName: user
                ? `${user.firstName} ${user.lastName}`
                : row.userId,
              teamId: team?.id,
              teamName: team?.name,
              division: team?.division,
              votes: row.votes,
              gender:
                user?.gender === 'male'
                  ? 0
                  : user?.gender === 'female'
                    ? 1
                    : maleVotes > femaleVotes
                      ? 0
                      : 1,
            }
          })
          .filter(
            (row) =>
              row.votes > 0 &&
              ((row.gender === 0 && slots.male) ||
                (row.gender === 1 && slots.female)),
          )
          .sort((a, b) => {
            const diff = b.votes - a.votes
            if (diff !== 0) return diff
            return a.userName.localeCompare(b.userName)
          })
        return {rows: result}
      },
  }),

  createEndpoint({
    ...FeatureFixtureSetupLoadDef,
    handler:
      ({seasonId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Season.getOne({id: seasonId})
        return {
          teams: await _getSeasonTeams(seasonId),
        }
      },
  }),

  createEndpoint({
    ...FeatureFixtureTallyLoadDef,
    handler:
      ({fixtureId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const fixture = await $Fixture.getOne({id: fixtureId})
        const [teams, reports] = await Promise.all([
          _getSeasonTeams(fixture.seasonId),
          $Report.getMany({fixtureId}, {sort: {createdOn: -1}}),
        ])
        return {fixture, teams, reports}
      },
  }),

  createEndpoint({
    ...FeatureFixtureViewLoadDef,
    handler:
      ({fixtureId}) =>
      async () => {
        const fixture = await $Fixture.getOne({id: fixtureId})
        return {
          fixture,
          teams: await _getSeasonTeams(fixture.seasonId),
        }
      },
  }),

  createEndpoint({
    ...FeatureTeamSetupLoadDef,
    handler:
      ({seasonId, search}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        await $Season.getOne({id: seasonId})
        const [teams, memberships] = await Promise.all([
          $Team.aggregate(
            _getTeamListPipeline(
              {
                seasonId,
                name: regex.from(search ?? ''),
              },
              'name',
              'asc',
            ),
          ),
          $Member.getMany({userId: user.id, seasonId}),
        ])
        const membership = memberships[0]
        const pendingTeam = membership
          ? await $Team.maybeOne({id: membership.teamId})
          : undefined
        return {teams, pendingTeam}
      },
  }),

  createEndpoint({
    ...FeatureDashboardUserMembershipsLoadDef,
    handler:
      ({userId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $User.getOne({id: userId})
        const members = await $Member.getMany({userId})
        const [teams, seasons] = await Promise.all([
          $Team.getMany({id: {$in: members.map((member) => member.teamId)}}),
          $Season.getMany({
            id: {$in: members.map((member) => member.seasonId)},
          }),
        ])
        return {members, seasons, teams}
      },
  }),
])

async function _getSeasonTeams(seasonId: string) {
  return $Team.aggregate(
    _getTeamListPipeline({seasonId}, 'division', 'asc'),
  ) as Promise<TTeam[]>
}

async function _getSeasonFixtures(seasonId: string) {
  return $Fixture.getMany({seasonId}, {sort: {date: 1}})
}

async function _getReportSearchResult({
  fixtureIds,
  season,
  search,
  limit,
  skip,
}: {
  fixtureIds: string[]
  season: TSeason
  search?: string
  limit?: number
  skip?: number
}) {
  const [result] = await $Report.aggregate<{
    count: number
    reports: TReportSearchRow[]
  }>(_createReportSearchPipeline({fixtureIds, season, search, limit, skip}))
  return result ?? {count: 0, reports: []}
}

async function _getAgainstOptions({
  user,
  seasonId,
  fixtureId,
  teamId,
}: {
  user: {id: string; admin?: boolean}
  seasonId: string
  fixtureId: string
  teamId: string
}) {
  let team: TTeam
  if (user.admin) team = await $Team.getOne({id: teamId, seasonId})
  else [team] = await requireTeam(user as any, teamId)
  const fixture = await $Fixture.getOne({id: fixtureId})
  if (fixture.seasonId !== seasonId) {
    throw badRequestError('Fixture does not belong to the selected season.', {
      errorCode: 'report.fixture_invalid',
    })
  }
  const againstTeamIds = fixture.games.reduce((all, game) => {
    if (game.team1Id === team.id) all.push(game.team2Id)
    if (game.team2Id === team.id) all.push(game.team1Id)
    return all
  }, [] as string[])
  if (!againstTeamIds.length) {
    throw badRequestError(
      'Failed to find the opposition team. Your team is may not be playing in this fixture.',
      {errorCode: 'report.matchup_invalid'},
    )
  }
  const [againstTeams, members] = await Promise.all([
    $Team.getMany({id: {$in: againstTeamIds}}),
    $Member.getMany({teamId: {$in: againstTeamIds}, pending: false}),
  ])
  const users = await $User.getMany({
    id: {$in: members.map((member) => member.userId)},
  })
  const userMap = new Map(
    users.map((user) => [user.id, selectPublicUserFields(user)]),
  )
  return againstTeamIds
    .map((againstTeamId) => {
      const againstTeam = againstTeams.find((item) => item.id === againstTeamId)
      if (!againstTeam) return undefined
      const teamUsers = members
        .filter((member) => member.teamId === againstTeamId)
        .map((member) => userMap.get(member.userId))
        .filter(Boolean)
      return {
        team: againstTeam,
        users: teamUsers,
      }
    })
    .filter(Boolean) as Array<{
    team: TTeam
    users: ReturnType<typeof selectPublicUserFields>[]
  }>
}

function _sortSpiritRows(
  rows: TFeatureSpiritRow[],
  sortBy: (typeof FEATURE_SPIRIT_SORT_KEYS)[number],
  sortDirection: (typeof FEATURE_SORT_DIRECTIONS)[number],
) {
  const direction = sortDirection === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sortBy === 'team') {
      return a.team.name.localeCompare(b.team.name) * direction
    }
    if (sortBy === 'division') {
      const aDivision = a.team.division
      const bDivision = b.team.division
      if (typeof aDivision !== 'number' && typeof bDivision !== 'number') {
        return a.team.name.localeCompare(b.team.name)
      }
      if (typeof aDivision !== 'number') return 1
      if (typeof bDivision !== 'number') return -1
      const divisionDiff = aDivision - bDivision
      if (divisionDiff !== 0) return divisionDiff * direction
      return a.team.name.localeCompare(b.team.name)
    }
    return (a[sortBy] - b[sortBy]) * direction
  })
}

function _createSpiritAggregatePipeline(
  fixtureIds: string[],
  useOfficialScoring: boolean,
): Document[] {
  const spiritExpression = useOfficialScoring
    ? {
        $add: [
          {$ifNull: ['$spiritP1', 0]},
          {$ifNull: ['$spiritP2', 0]},
          {$ifNull: ['$spiritP3', 0]},
          {$ifNull: ['$spiritP4', 0]},
          {$ifNull: ['$spiritP5', 0]},
        ],
      }
    : {$ifNull: ['$spirit', 0]}
  return [
    {$match: {fixtureId: {$in: fixtureIds}}},
    {$addFields: {spiritTotal: spiritExpression}},
    {
      $facet: {
        received: [
          {
            $group: {
              _id: '$teamAgainstId',
              spirit: {$sum: '$spiritTotal'},
              reports: {$sum: 1},
            },
          },
        ],
        allocated: [
          {
            $group: {
              _id: '$teamId',
              spirit: {$sum: '$spiritTotal'},
              reports: {$sum: 1},
            },
          },
        ],
        reports: [
          {
            $project: {
              _id: 0,
              teamId: '$teamId',
              teamAgainstId: '$teamAgainstId',
              spirit: '$spiritTotal',
            },
          },
        ],
      },
    },
  ]
}

function _getAdjustedSpiritMaps(reports: TSpiritReportAggregateRow[]) {
  const globalAverage =
    reports.reduce((total, report) => total + report.spirit, 0) /
    (reports.length || 1)
  const reporterStatsMap = new Map<string, TSpiritReportStats>()
  for (const report of reports) {
    _addSpiritReportStat(reporterStatsMap, report.teamId, report.spirit)
  }
  const reporterBiasMap = new Map<string, number>()
  for (const [teamId, stats] of reporterStatsMap) {
    // Pull scorer bias toward zero until there are enough reports to trust it.
    const confidence =
      stats.reports /
      (stats.reports + SPIRIT_SCORER_BIAS_SHRINKAGE_REPORTS)
    const average = stats.spirit / stats.reports
    reporterBiasMap.set(teamId, confidence * (average - globalAverage))
  }
  const receivedStatsMap = new Map<string, TSpiritReportStats>()
  const allocatedStatsMap = new Map<string, TSpiritReportStats>()
  for (const report of reports) {
    const adjustedSpirit =
      report.spirit - (reporterBiasMap.get(report.teamId) ?? 0)
    _addSpiritReportStat(
      receivedStatsMap,
      report.teamAgainstId,
      adjustedSpirit,
    )
    _addSpiritReportStat(allocatedStatsMap, report.teamId, adjustedSpirit)
  }
  return {
    receivedAverageMap: _getSpiritAverageMap(receivedStatsMap),
    allocatedAverageMap: _getSpiritAverageMap(allocatedStatsMap),
  }
}

function _addSpiritReportStat(
  map: Map<string, TSpiritReportStats>,
  teamId: string,
  spirit: number,
) {
  const stats = map.get(teamId) ?? {spirit: 0, reports: 0}
  stats.spirit += spirit
  stats.reports += 1
  map.set(teamId, stats)
}

function _getSpiritAverageMap(map: Map<string, TSpiritReportStats>) {
  const averageMap = new Map<string, number>()
  for (const [teamId, stats] of map) {
    averageMap.set(teamId, stats.spirit / stats.reports)
  }
  return averageMap
}

function _createMvpAggregatePipeline(
  fixtureIds: string[],
  useOfficialScoring: boolean,
  season: TSeason,
): Document[] {
  const votes: Document[] = [
    ...(isSeasonMvpSlotEnabled(season, 'male')
      ? [
          {
            userId: '$mvpMale',
            points: useOfficialScoring ? 5 : 1,
            gender: 0,
            teamId: '$teamAgainstId',
          },
          {
            userId: '$mvpMale2',
            points: useOfficialScoring ? 3 : 0,
            gender: 0,
            teamId: '$teamAgainstId',
          },
        ]
      : []),
    ...(isSeasonMvpSlotEnabled(season, 'female')
      ? [
          {
            userId: '$mvpFemale',
            points: useOfficialScoring ? 5 : 1,
            gender: 1,
            teamId: '$teamAgainstId',
          },
          {
            userId: '$mvpFemale2',
            points: useOfficialScoring ? 3 : 0,
            gender: 1,
            teamId: '$teamAgainstId',
          },
        ]
      : []),
  ]
  return [
    {$match: {fixtureId: {$in: fixtureIds}}},
    {
      $project: {
        votes: {
          $filter: {
            input: votes,
            as: 'vote',
            cond: {
              $and: [
                {$eq: [{$type: '$$vote.userId'}, 'string']},
                {$ne: ['$$vote.userId', '']},
                {$gt: ['$$vote.points', 0]},
              ],
            },
          },
        },
      },
    },
    {$unwind: '$votes'},
    {
      $group: {
        _id: '$votes.userId',
        votes: {$sum: '$votes.points'},
        maleVotes: {
          $sum: {
            $cond: [{$eq: ['$votes.gender', 0]}, '$votes.points', 0],
          },
        },
        femaleVotes: {
          $sum: {
            $cond: [{$eq: ['$votes.gender', 1]}, '$votes.points', 0],
          },
        },
        teamId: {$first: '$votes.teamId'},
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        votes: 1,
        maleVotes: 1,
        femaleVotes: 1,
        teamId: 1,
      },
    },
    {$sort: {votes: -1, userId: 1}},
  ]
}

function _createReportSearchPipeline({
  fixtureIds,
  season,
  search,
  limit,
  skip,
}: {
  fixtureIds: string[]
  season: TSeason
  search?: string
  limit?: number
  skip?: number
}) {
  const trimmedSearch = search?.trim()
  const slots = getSeasonMvpSlots(season)
  const pipeline: Document[] = [
    {$match: {fixtureId: {$in: fixtureIds}}},
    {
      $lookup: {
        from: 'fixture',
        localField: 'fixtureId',
        foreignField: 'id',
        as: 'fixture',
      },
    },
    {$unwind: '$fixture'},
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
              mvpMale: slots.male ? {$ifNull: ['$mvpMale', '$$REMOVE']} : '$$REMOVE',
              mvpMale2: slots.male
                ? {$ifNull: ['$mvpMale2', '$$REMOVE']}
                : '$$REMOVE',
              mvpFemale: slots.female
                ? {$ifNull: ['$mvpFemale', '$$REMOVE']}
                : '$$REMOVE',
              mvpFemale2: slots.female
                ? {$ifNull: ['$mvpFemale2', '$$REMOVE']}
                : '$$REMOVE',
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

function _getTeamSort(
  sortBy: TTeamListSortKey,
  sortDirection: TTeamListSortDirection,
) {
  const direction: 1 | -1 = sortDirection === 'asc' ? 1 : -1
  switch (sortBy) {
    case 'name':
      return {name: direction}
    case 'division':
      return {
        _sortDivisionMissing: 1 as const,
        division: direction,
        name: 1 as const,
      }
    case 'phone':
      return {phone: direction, name: 1 as const}
    case 'email':
      return {email: direction, name: 1 as const}
    case 'createdOn':
      return {createdOn: direction}
  }
}

function _getTeamListPipeline(
  query: Document,
  sortBy: TTeamListSortKey,
  sortDirection: TTeamListSortDirection,
  skip?: number,
  limit?: number,
): Document[] {
  const pipeline: Document[] = [{$match: query}]
  if (sortBy === 'division') {
    pipeline.push({
      $addFields: {
        _sortDivisionMissing: {
          $in: [{$type: '$division'}, ['missing', 'null']],
        },
      },
    })
  }
  pipeline.push({$sort: _getTeamSort(sortBy, sortDirection)})
  if (skip && skip > 0) pipeline.push({$skip: skip})
  if (limit !== undefined) pipeline.push({$limit: limit})
  if (sortBy === 'division')
    pipeline.push({$project: {_sortDivisionMissing: 0}})
  return pipeline
}
