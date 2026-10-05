import {badRequestError} from '@shared/errors'
import {
  FeatureCompetitionLoadDef,
  FeatureDashboardMvpLoadDef,
  FeatureDashboardReportsLoadDef,
  FeatureDashboardSpiritLoadDef,
  FeatureDashboardTeamsLoadDef,
  FeatureDashboardUserMembershipsLoadDef,
  FeatureFixtureTallyLoadDef,
  FeatureFixtureViewLoadDef,
  FeatureReportEditorLoadDef,
  FeatureTeamSetupLoadDef,
  TFeatureAgainstOption,
} from '@shared/endpoints/FeatureDef'
import {TFixture} from '@shared/schemas/ioFixture'
import {TTeam} from '@shared/schemas/ioTeam'
import {RequestHandler} from 'micro'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../http/createEndpoint'
import {regex} from '../utils/regex'
import {requireAccess} from '../auth/requireAccess'
import {requireTeam} from '../auth/requireTeam'
import {selectPublicUserFields} from '../services/userFields'
import {buildSpiritRows, sortSpiritRows} from '../services/spiritStats'
import {
  getMvpLeaderboardPipeline,
  TMvpLeaderboardRow,
  toMvpRows,
} from '../queries/mvpLeaderboard'
import {
  getReportSearchPipeline,
  TReportSearchResult,
} from '../queries/reportSearch'
import {
  getSpiritTablePipeline,
  TSpiritTableAggregate,
} from '../queries/spiritTable'
import {
  getSeasonTeamsPipeline,
  getTeamListPipeline,
  TEAM_LIST_DEFAULT_SORT_BY,
  TEAM_LIST_DEFAULT_SORT_DIRECTION,
} from '../queries/teamList'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...FeatureCompetitionLoadDef,
    handler:
      ({seasonId}) =>
      async () => {
        await $Season.getOne({id: seasonId})
        return _getSeasonTeamsAndFixtures(seasonId)
      },
  }),

  createEndpoint({
    ...FeatureDashboardTeamsLoadDef,
    handler:
      ({seasonId, search, sortBy, sortDirection, skip, limit}) =>
      async () => {
        await $Season.getOne({id: seasonId})
        const query = {seasonId, name: regex.from(search ?? '')}
        const [count, teams] = await Promise.all([
          $Team.count(query),
          $Team.aggregate(
            getTeamListPipeline(
              query,
              sortBy ?? TEAM_LIST_DEFAULT_SORT_BY,
              sortDirection ?? TEAM_LIST_DEFAULT_SORT_DIRECTION,
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
        const {teams, fixtures} = await _getSeasonTeamsAndFixtures(seasonId)
        const [searchResult] = await $Report.aggregate<TReportSearchResult>(
          getReportSearchPipeline({
            fixtureIds: _getFixtureIds(fixtures),
            season,
            search,
            limit,
            skip,
          }),
        )
        return {
          ...(searchResult ?? {count: 0, reports: []}),
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
        const [season, {teams, fixtures}] = await Promise.all([
          $Season.getOne({id: seasonId}),
          _getSeasonTeamsAndFixtures(seasonId),
        ])
        const againstOptions =
          fixtureId && teamId
            ? await _getAgainstOptions({
                user,
                seasonId: season.id,
                fixtureId,
                teamId,
              })
            : []
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
        const {teams, fixtures} = await _getSeasonTeamsAndFixtures(seasonId)
        const [aggregate] = await $Report.aggregate<TSpiritTableAggregate>(
          getSpiritTablePipeline(
            _getFixtureIds(fixtures),
            !!season.useOfficialScoring,
          ),
        )
        return {
          rows: sortSpiritRows(
            buildSpiritRows(teams, aggregate),
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
        const {teams, fixtures} = await _getSeasonTeamsAndFixtures(seasonId)
        const aggregateRows = await $Report.aggregate<TMvpLeaderboardRow>(
          getMvpLeaderboardPipeline(_getFixtureIds(fixtures), season),
        )
        const users = await $User.getMany({
          id: {$in: aggregateRows.map((row) => row.userId)},
        })
        return {
          rows: toMvpRows({
            aggregateRows,
            season,
            teams,
            users: users.map(selectPublicUserFields),
          }),
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
        return {fixture, teams: await _getSeasonTeams(fixture.seasonId)}
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
            getTeamListPipeline(
              {seasonId, name: regex.from(search ?? '')},
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

async function _getSeasonTeams(seasonId: string): Promise<TTeam[]> {
  return $Team.aggregate<TTeam>(getSeasonTeamsPipeline(seasonId))
}

async function _getSeasonTeamsAndFixtures(
  seasonId: string,
): Promise<{teams: TTeam[]; fixtures: TFixture[]}> {
  const [teams, fixtures] = await Promise.all([
    _getSeasonTeams(seasonId),
    $Fixture.getMany({seasonId}, {sort: {date: 1}}),
  ])
  return {teams, fixtures}
}

function _getFixtureIds(fixtures: TFixture[]): string[] {
  return fixtures.map((fixture) => fixture.id)
}

/**
 * The teams `teamId` plays in a fixture, each with its confirmed players as
 * MVP options. Non-admins must belong to `teamId`.
 */
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
}): Promise<TFeatureAgainstOption[]> {
  const team = user.admin
    ? await $Team.getOne({id: teamId, seasonId})
    : (await requireTeam(user, teamId))[0]
  const fixture = await $Fixture.getOne({id: fixtureId})
  if (fixture.seasonId !== seasonId) {
    throw badRequestError('Fixture does not belong to the selected season.', {
      errorCode: 'report.fixture_invalid',
    })
  }
  const againstTeamIds = fixture.games.flatMap((game) => [
    ...(game.team1Id === team.id ? [game.team2Id] : []),
    ...(game.team2Id === team.id ? [game.team1Id] : []),
  ])
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
  return againstTeamIds.flatMap((againstTeamId) => {
    const againstTeam = againstTeams.find((item) => item.id === againstTeamId)
    if (!againstTeam) return []
    const teamUsers = members
      .filter((member) => member.teamId === againstTeamId)
      .flatMap((member) => userMap.get(member.userId) ?? [])
    return [{team: againstTeam, users: teamUsers}]
  })
}
