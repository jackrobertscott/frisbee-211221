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
} from '@shared/endpoints/FeatureDef'
import {createEndpoint} from './createEndpoint'

export const $FeatureCompetitionLoad = createEndpoint(FeatureCompetitionLoadDef)

export const $FeatureDashboardTeamsLoad = createEndpoint(
  FeatureDashboardTeamsLoadDef,
)

export const $FeatureDashboardReportsLoad = createEndpoint(
  FeatureDashboardReportsLoadDef,
)

export const $FeatureReportEditorLoad = createEndpoint(
  FeatureReportEditorLoadDef,
)

export const $FeatureDashboardSpiritLoad = createEndpoint(
  FeatureDashboardSpiritLoadDef,
)

export const $FeatureDashboardMvpLoad = createEndpoint(
  FeatureDashboardMvpLoadDef,
)

export const $FeatureFixtureTallyLoad = createEndpoint(
  FeatureFixtureTallyLoadDef,
)

export const $FeatureFixtureViewLoad = createEndpoint(FeatureFixtureViewLoadDef)

export const $FeatureTeamSetupLoad = createEndpoint(FeatureTeamSetupLoadDef)

export const $FeatureDashboardUserMembershipsLoad = createEndpoint(
  FeatureDashboardUserMembershipsLoadDef,
)
