import {authPoint} from '@shared/auth/authAccess'
import {ioFixture} from '@shared/schemas/ioFixture'
import {ioMember} from '@shared/schemas/ioMember'
import {ioReport} from '@shared/schemas/ioReport'
import {ioSeason} from '@shared/schemas/ioSeason'
import {ioTeam} from '@shared/schemas/ioTeam'
import {ioUserPublic} from '@shared/schemas/ioUser'
import {ioReportSearchRow} from '@shared/endpoints/ReportDef'
import {
  TEAM_LIST_SORT_DIRECTIONS,
  TEAM_LIST_SORT_KEYS,
} from '@shared/endpoints/TeamDef'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io, TypeIoValue} from '@shared/torva'

export const FEATURE_SPIRIT_SORT_KEYS = [
  'team',
  'division',
  'receivedSpirit',
  'receivedReports',
  'receivedAverage',
  'adjustedReceivedAverage',
  'allocatedSpirit',
  'allocatedReports',
  'allocatedAverage',
  'adjustedAllocatedAverage',
  'averageDifference',
  'adjustedDifference',
] as const

export type TFeatureSpiritSortKey = (typeof FEATURE_SPIRIT_SORT_KEYS)[number]

export const FEATURE_SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TFeatureSortDirection = (typeof FEATURE_SORT_DIRECTIONS)[number]

export const ioFeatureAgainstOption = io.object({
  team: ioTeam,
  users: io.array(ioUserPublic),
})

export type TFeatureAgainstOption = TypeIoValue<typeof ioFeatureAgainstOption>

export const ioFeatureSpiritRow = io.object({
  team: ioTeam,
  receivedSpirit: io.number(),
  receivedReports: io.number(),
  receivedAverage: io.number(),
  adjustedReceivedAverage: io.number(),
  allocatedSpirit: io.number(),
  allocatedReports: io.number(),
  allocatedAverage: io.number(),
  adjustedAllocatedAverage: io.number(),
  averageDifference: io.number(),
  adjustedDifference: io.number(),
})

export type TFeatureSpiritRow = TypeIoValue<typeof ioFeatureSpiritRow>

export const ioFeatureMvpRow = io.object({
  userId: ioUserPublic.shape.id,
  userName: io.string(),
  teamId: io.optional(ioTeam.shape.id),
  teamName: io.optional(ioTeam.shape.name),
  division: ioTeam.shape.division,
  votes: io.number(),
  gender: io.number(),
})

export type TFeatureMvpRow = TypeIoValue<typeof ioFeatureMvpRow>

export const FeatureCompetitionLoadDef = {
  path: '/FeatureCompetitionLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
  }),
  result: io.object({
    teams: io.array(ioTeam),
    fixtures: io.array(ioFixture),
  }),
} satisfies TEndpointDef

export const FeatureDashboardTeamsLoadDef = {
  path: '/FeatureDashboardTeamsLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    search: io.optional(io.string().emptyok()),
    sortBy: io.optional(io.enum([...TEAM_LIST_SORT_KEYS])),
    sortDirection: io.optional(io.enum([...TEAM_LIST_SORT_DIRECTIONS])),
    limit: io.optional(io.number()),
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const FeatureDashboardReportsLoadDef = {
  access: authPoint.reportManage,
  path: '/FeatureDashboardReportsLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    search: io.optional(io.string().emptyok()),
    limit: io.optional(io.number()),
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    reports: io.array(ioReportSearchRow),
    fixtures: io.array(ioFixture),
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const FeatureReportEditorLoadDef = {
  access: authPoint.reportWrite,
  path: '/FeatureReportEditorLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    fixtureId: io.optional(ioFixture.shape.id),
    teamId: io.optional(ioTeam.shape.id),
  }),
  result: io.object({
    fixtures: io.array(ioFixture),
    teams: io.array(ioTeam),
    againstOptions: io.array(ioFeatureAgainstOption),
  }),
} satisfies TEndpointDef

export const FeatureDashboardSpiritLoadDef = {
  access: authPoint.reportManage,
  path: '/FeatureDashboardSpiritLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    sortBy: io.optional(io.enum([...FEATURE_SPIRIT_SORT_KEYS])),
    sortDirection: io.optional(io.enum([...FEATURE_SORT_DIRECTIONS])),
  }),
  result: io.object({
    rows: io.array(ioFeatureSpiritRow),
  }),
} satisfies TEndpointDef

export const FeatureDashboardMvpLoadDef = {
  access: authPoint.reportManage,
  path: '/FeatureDashboardMvpLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
  }),
  result: io.object({
    rows: io.array(ioFeatureMvpRow),
  }),
} satisfies TEndpointDef

export const FeatureFixtureSetupLoadDef = {
  access: authPoint.fixtureManage,
  path: '/FeatureFixtureSetupLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
  }),
  result: io.object({
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const FeatureFixtureTallyLoadDef = {
  access: authPoint.fixtureManage,
  path: '/FeatureFixtureTallyLoad',
  payload: io.object({
    fixtureId: ioFixture.shape.id,
  }),
  result: io.object({
    fixture: ioFixture,
    teams: io.array(ioTeam),
    reports: io.array(ioReport),
  }),
} satisfies TEndpointDef

export const FeatureFixtureViewLoadDef = {
  path: '/FeatureFixtureViewLoad',
  payload: io.object({
    fixtureId: ioFixture.shape.id,
  }),
  result: io.object({
    fixture: ioFixture,
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef

export const FeatureTeamSetupLoadDef = {
  access: authPoint.teamJoin,
  path: '/FeatureTeamSetupLoad',
  payload: io.object({
    seasonId: ioSeason.shape.id,
    search: io.optional(io.string().emptyok()),
  }),
  result: io.object({
    teams: io.array(ioTeam),
    pendingTeam: io.optional(ioTeam),
  }),
} satisfies TEndpointDef

export const FeatureDashboardUserMembershipsLoadDef = {
  access: authPoint.userManage,
  path: '/FeatureDashboardUserMembershipsLoad',
  payload: io.object({
    userId: ioUserPublic.shape.id,
  }),
  result: io.object({
    members: io.array(ioMember),
    seasons: io.array(ioSeason),
    teams: io.array(ioTeam),
  }),
} satisfies TEndpointDef
