# Feature Endpoint Refactor Report

## Overview

This refactor removed the browser-side pattern of loading a feature from multiple unrelated endpoints and stitching the result together in memory.

A new feature-loading contract layer was added:

- `shared/src/endpoints/FeatureDef.ts`
- `server/src/endpoints/Feature.ts`
- `browser/src/endpoints/Feature.ts`

These endpoints now return feature-scoped payloads that are aligned with the UI screens and modals that consume them.

## Features Migrated

### Competition views

- `DashboardFixtures` now loads teams and fixtures from `FeatureCompetitionLoad`.
- `DashboardLadder` now loads teams and fixtures from `FeatureCompetitionLoad`.
- `FixtureView` now loads fixture + season teams from `FeatureFixtureViewLoad`.

### Reports

- `DashboardReports` now loads report rows, fixtures, and teams from `FeatureDashboardReportsLoad`.
- `ReportCreate` now loads fixtures and matchup options from `FeatureReportEditorLoad`.
- The dashboard report create/edit modal now loads matchup options from `FeatureReportEditorLoad`.

### Aggregated admin views

- `DashboardSpirit` now loads precomputed spirit rows from `FeatureDashboardSpiritLoad`.
- `DashboardMVP` now loads precomputed MVP rows from `FeatureDashboardMvpLoad`.
- `DashboardTeams` now loads its list from `FeatureDashboardTeamsLoad`.
- The user memberships tab in `DashboardUsers` now loads from `FeatureDashboardUserMembershipsLoad`.

### Setup and admin modals

- `FixtureSetupForm` now loads teams from `FeatureFixtureSetupLoad`.
- `FixtureTallyForm` now loads fixture tally data from `FeatureFixtureTallyLoad`.
- `TeamSetup` now loads searchable team join data from `FeatureTeamSetupLoad`.

## Backend Changes

- Moved feature-oriented loading into dedicated server handlers instead of composing multiple generic list endpoints in the browser.
- Pushed spirit and MVP aggregation to the server.
- Kept database access inside typed table helpers only.
- Preserved season/team access checks in the new report editor and team setup loaders.
- Added `Feature` to the server endpoint registry.

## Legacy Endpoints Removed

The following legacy loading endpoints were deleted from shared/browser/server:

- `FixtureListOfSeason`
- `FixtureGet`
- `TeamListOfSeason`
- `ReportListOfFixture`
- `ReportListOfSeason`
- `ReportSearchOfSeason`
- `ReportGetFixtureAgainst`
- `MemberListOfUser`
- `MemberListOfUserAdmin`
- `UserListManyById`

Mutation endpoints were left intact where they are still part of active flows.

## Verification

Typechecks passed:

- `shared`: `npm run typecheck`
- `server`: `npm run typecheck`
- `browser`: `npm run typecheck`
