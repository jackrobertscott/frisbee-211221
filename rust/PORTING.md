# Porting checklist

Every TypeScript source and test file under `server/src`, `server/test` and
`shared/src`, with its Rust counterpart, owner and status. Paths in the
"Rust" column are relative to `rust/`. When you finish a file, change its
status to `done` (and list any test that is genuinely inapplicable in the
notes below, with the reason).

Owners: **Foundation** (core layer, already ported) or the endpoint domain
that consumes the file (Feature, Fixture, Member, Port, Report, Season,
Security, Team, User). Tests named `foo.test.ts` become `#[cfg(test)]`
modules in the matching Rust file (or `foo_tests.rs` next to it);
integration tests in `server/test/integration/x.test.ts` become
`tests/x.rs`.

| TypeScript | Rust | Owner | Status |
| --- | --- | --- | --- |
| `server/src/auth/attemptLimit.ts` | src/auth/attempt_limit.rs | Foundation | done |
| `server/src/auth/hash.ts` | src/auth/hash.rs | Foundation | done |
| `server/src/auth/jwt.ts` | src/auth/jwt.rs | Foundation | done |
| `server/src/auth/requireAccess.ts` | src/auth/require.rs (`require_access`, `Ctx::require_access`) | Foundation | done |
| `server/src/auth/requireTeam.ts` | src/auth/require.rs (`require_team`) | Foundation | done |
| `server/src/auth/requireUser.ts` | src/auth/require.rs (`require_user`, `Ctx::require_user`) | Foundation | done |
| `server/src/auth/sessions.ts` | src/auth/sessions.rs | Foundation | done |
| `server/src/cluster.test.ts` | src/server.rs (tests) | Foundation | done (drain tests; scaling tests N/A) |
| `server/src/cluster.ts` | src/server.rs (`serve`, graceful drain) | Foundation | done (clustering replaced, see notes) |
| `server/src/config.ts` | src/config.rs | Foundation | done |
| `server/src/db/mongo.test.ts` | src/db/mod.rs (tests) | Foundation | done (connect/transaction-detection tests N/A) |
| `server/src/db/mongo.ts` | src/db/mod.rs (`Db`, `call`, `transaction`, `savepoint`) | Foundation | done |
| `server/src/db/schemaAudit.test.ts` | src/db/audit.rs (tests) | Foundation | done |
| `server/src/db/schemaAudit.ts` | src/db/audit.rs | Foundation | done |
| `server/src/db/syncIndexes.test.ts` | src/db/migrations_tests.rs | Foundation | done |
| `server/src/db/syncIndexes.ts` | src/db/migrations.rs | Foundation | done |
| `server/src/db/table.test.ts` | src/db/table_tests.rs | Foundation | done |
| `server/src/db/table.ts` | src/db/table.rs, src/db/filter.rs, src/db/schema.rs | Foundation | done |
| `server/src/endpoints/Feature.ts` | src/endpoints/feature.rs (stub with empty `routes()`) | Feature | pending |
| `server/src/endpoints/Fixture.ts` | src/endpoints/fixture.rs (stub with empty `routes()`) | Fixture | pending |
| `server/src/endpoints/index.ts` | src/endpoints/mod.rs (`all`) | Foundation | done |
| `server/src/endpoints/Member.ts` | src/endpoints/member.rs | Member | done |
| `server/src/endpoints/Port.ts` | src/endpoints/port.rs (stub with empty `routes()`) | Port | pending |
| `server/src/endpoints/Report.ts` | src/endpoints/report.rs (stub with empty `routes()`) | Report | pending |
| `server/src/endpoints/Season.ts` | src/endpoints/season.rs | Season | done |
| `server/src/endpoints/Security.ts` | src/endpoints/security.rs | Security | done |
| `server/src/endpoints/Team.ts` | src/endpoints/team.rs | Team | done |
| `server/src/endpoints/User.ts` | src/endpoints/user.rs (stub with empty `routes()`) | User | pending |
| `server/src/gameday/credentials.test.ts` | src/gameday/credentials.rs (tests) | Port | pending |
| `server/src/gameday/credentials.ts` | src/gameday/credentials.rs | Port | pending |
| `server/src/gameday/exportCli.test.ts` | src/gameday/export_cli.rs (tests) | Port | pending |
| `server/src/gameday/exportCli.ts` | src/bin/gameday-export.rs (+ src/gameday/export_cli.rs) | Port | pending |
| `server/src/gameday/exporter.test.ts` | src/gameday/exporter.rs (tests) | Port | pending |
| `server/src/gameday/exporter.ts` | src/gameday/exporter.rs | Port | pending |
| `server/src/gameday/importMembers.test.ts` | src/gameday/import_members.rs (tests) | Port | pending |
| `server/src/gameday/importMembers.ts` | src/gameday/import_members.rs | Port | pending |
| `server/src/gameday/runExportProcess.test.ts` | src/gameday/run_export_process.rs (tests) | Port | pending |
| `server/src/gameday/runExportProcess.ts` | src/gameday/run_export_process.rs | Port | pending |
| `server/src/gameday/scheduler.test.ts` | src/gameday/scheduler.rs (tests) | Port | pending |
| `server/src/gameday/scheduler.ts` | src/gameday/scheduler.rs (hook stub exists) | Port | pending |
| `server/src/gameday/types.test.ts` | src/gameday/types.rs (tests) | Foundation | done |
| `server/src/gameday/types.ts` | src/gameday/types.rs | Foundation | done |
| `server/src/http/capture.test.ts` | src/http/capture_tests.rs | Foundation | done |
| `server/src/http/capture.ts` | src/http/capture.rs | Foundation | done |
| `server/src/http/cors.ts` | src/http/cors.rs | Foundation | done |
| `server/src/http/createEndpoint.ts` | src/http/endpoint.rs, src/http/body.rs | Foundation | done |
| `server/src/http/intrusion.test.ts` | src/http/intrusion_tests.rs | Foundation | done |
| `server/src/http/intrusion.ts` | src/http/intrusion.rs | Foundation | done |
| `server/src/http/origin.ts` | src/http/origin.rs | Foundation | done |
| `server/src/http/prerequest.ts` | src/http/prerequest.rs | Foundation | done |
| `server/src/http/requestHandler.ts` | src/http/request_handler.rs | Foundation | done |
| `server/src/http/tarpit.test.ts` | src/http/tarpit_tests.rs | Foundation | done (already-ended case N/A) |
| `server/src/http/tarpit.ts` | src/http/tarpit.rs | Foundation | done |
| `server/src/http/uploads.test.ts` | src/http/uploads_tests.rs | Foundation | done |
| `server/src/http/uploads.ts` | src/http/uploads.rs | Foundation | done |
| `server/src/index.ts` | src/server.rs (`bootstrap`), src/bin/frisbee-server.rs | Foundation | done |
| `server/src/migrations/userGenderMatching.ts` | src/migrations/user_gender_matching.rs (+ src/tables/user.rs `legacy`) | Foundation | done |
| `server/src/queries/mvpLeaderboard.test.ts` | src/queries/mvp_leaderboard.rs (tests) | Feature | pending |
| `server/src/queries/mvpLeaderboard.ts` | src/queries/mvp_leaderboard.rs | Feature | pending |
| `server/src/queries/reportSearch.test.ts` | src/queries/report_search.rs (tests) | Feature | pending |
| `server/src/queries/reportSearch.ts` | src/queries/report_search.rs | Feature | pending |
| `server/src/queries/spiritTable.ts` | src/queries/spirit_table.rs | Feature | pending |
| `server/src/queries/teamList.test.ts` | src/queries/team_list.rs (tests) | Feature | pending |
| `server/src/queries/teamList.ts` | src/queries/team_list.rs | Feature | pending |
| `server/src/queries/userList.test.ts` | src/queries/user_list.rs (tests) | User | pending |
| `server/src/queries/userList.ts` | src/queries/user_list.rs | User | pending |
| `server/src/services/authPayload.ts` | src/services/auth_payload.rs | Security | done |
| `server/src/services/csvImport.test.ts` | src/services/csv_import.rs (tests) | Port | pending |
| `server/src/services/csvImport.ts` | src/services/csv_import.rs | Port | pending |
| `server/src/services/exportArchive.test.ts` | src/services/export_archive.rs (tests) | Port | pending |
| `server/src/services/exportArchive.ts` | src/services/export_archive.rs | Port | pending |
| `server/src/services/fixtureSchedule.test.ts` | src/services/fixture_schedule.rs (tests) | Fixture | pending |
| `server/src/services/fixtureSchedule.ts` | src/services/fixture_schedule.rs | Fixture | pending |
| `server/src/services/gamedayImportConfig.test.ts` | src/services/gameday_import_config.rs (tests) | Port | pending |
| `server/src/services/gamedayImportConfig.ts` | src/services/gameday_import_config.rs | Port | pending |
| `server/src/services/memberImport.ts` | src/services/member_import.rs | Port | pending |
| `server/src/services/missingReports.test.ts` | src/services/missing_reports.rs (tests) | Report | pending |
| `server/src/services/missingReports.ts` | src/services/missing_reports.rs | Report | pending |
| `server/src/services/mockData.test.ts` | src/services/mock_data.rs (tests) | Port | pending |
| `server/src/services/mockData.ts` | src/services/mock_data.rs | Port | pending |
| `server/src/services/reportMvps.test.ts` | src/services/report_mvps.rs (tests) | Report | pending |
| `server/src/services/reportMvps.ts` | src/services/report_mvps.rs | Report | pending |
| `server/src/services/roundRobin.test.ts` | src/services/round_robin.rs (tests) | Fixture | pending |
| `server/src/services/roundRobin.ts` | src/services/round_robin.rs | Fixture | pending |
| `server/src/services/seasonDeletion.ts` | src/services/season_deletion.rs | Season | done |
| `server/src/services/spiritStats.test.ts` | src/services/spirit_stats.rs (tests) | Feature | pending |
| `server/src/services/spiritStats.ts` | src/services/spirit_stats.rs | Feature | pending |
| `server/src/services/teamCaptaincy.ts` | src/services/team_captaincy.rs | Member | done |
| `server/src/services/userEmail.test.ts` | src/services/user_email_tests.rs | Foundation | done |
| `server/src/services/userEmail.ts` | src/services/user_email.rs | Foundation | done |
| `server/src/services/userFields.ts` | src/services/user_fields.rs | Foundation | done |
| `server/src/services/userMerge.test.ts` | src/services/user_merge.rs (tests) | User | pending |
| `server/src/services/userMerge.ts` | src/services/user_merge.rs | User | pending |
| `server/src/startup.test.ts` | src/startup.rs (tests) | Foundation | done |
| `server/src/startup.ts` | src/startup.rs | Foundation | done |
| `server/src/tables/$AuthAttemptLimit.ts` | src/tables/auth_attempt_limit.rs | Foundation | done |
| `server/src/tables/$Fixture.ts` | src/tables/fixture.rs | Foundation | done |
| `server/src/tables/$GamedayImportConfig.ts` | src/tables/gameday_import_config.rs | Foundation | done |
| `server/src/tables/$GamedayImportRun.ts` | src/tables/gameday_import_run.rs | Foundation | done |
| `server/src/tables/$Member.ts` | src/tables/member.rs | Foundation | done |
| `server/src/tables/$Report.ts` | src/tables/report.rs | Foundation | done |
| `server/src/tables/$Season.ts` | src/tables/season.rs | Foundation | done |
| `server/src/tables/$Session.ts` | src/tables/session.rs | Foundation | done |
| `server/src/tables/$Team.ts` | src/tables/team.rs | Foundation | done |
| `server/src/tables/$User.ts` | src/tables/user.rs | Foundation | done |
| `server/src/tables/index.ts` | src/tables/mod.rs | Foundation | done |
| `server/src/utils/csv.test.ts` | src/utils/csv.rs (tests) | Foundation | done |
| `server/src/utils/csv.ts` | src/utils/csv.rs | Foundation | done |
| `server/src/utils/html.ts` | src/utils/html.rs | Foundation | done |
| `server/src/utils/isRecord.ts` | src/utils/is_record.rs | Foundation | done |
| `server/src/utils/mail.test.ts` | src/utils/mail.rs, src/utils/html.rs (tests) | Foundation | done |
| `server/src/utils/mail.ts` | src/utils/mail.rs | Foundation | done |
| `server/src/utils/random.ts` | src/utils/random.rs | Foundation | done |
| `server/test/actors.ts` | tests/common/actors.rs | Foundation | done |
| `server/test/database.ts` | src/testing.rs (`TestApp`, `TestDir`) | Foundation | done |
| `server/test/globalSetup.ts` | — (no shared server needed: each test opens its own SQLite file) | Foundation | N/A |
| `server/test/harness.ts` | tests/common/mod.rs | Foundation | done |
| `server/test/integration/dashboards.test.ts` | tests/dashboards.rs | Feature | pending |
| `server/test/integration/fixtures.test.ts` | tests/fixtures.rs | Fixture | pending |
| `server/test/integration/gamedayImport.test.ts` | tests/gameday_import.rs | Port | pending |
| `server/test/integration/http.test.ts` | tests/http.rs | Foundation | done |
| `server/test/integration/members.test.ts` | tests/members.rs | Member | done |
| `server/test/integration/migrations.test.ts` | tests/migrations.rs | Foundation | done |
| `server/test/integration/port.test.ts` | tests/port.rs | Port | pending |
| `server/test/integration/reports.test.ts` | tests/reports.rs | Report | pending |
| `server/test/integration/seasons.test.ts` | tests/seasons.rs | Season | done |
| `server/test/integration/security.test.ts` | tests/security.rs | Security | done; 3 cases `#[ignore]`d until User lands (`/UserCurrentUpdate`) |
| `server/test/integration/teams.test.ts` | tests/teams.rs | Team | done; 11 `Feature*` cases `#[ignore]`d until Feature lands |
| `server/test/integration/users.test.ts` | tests/users.rs | User | pending |
| `server/test/setup.ts` | src/config.rs (`Config::for_tests`) | Foundation | done |
| `shared/src/auth/authAccess.test.ts` | src/shared/auth_access.rs (tests) | Foundation | done |
| `shared/src/auth/authAccess.ts` | src/shared/auth_access.rs | Foundation | done |
| `shared/src/endpoints/endpointDefs.test.ts` | src/shared/contract/contract_tests.rs | Foundation | done |
| `shared/src/endpoints/FeatureDef.ts` | src/shared/contract/feature.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/FixtureDef.ts` | src/shared/contract/fixture.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/MemberDef.ts` | src/shared/contract/member.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/PortDef.ts` | src/shared/contract/port.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/ReportDef.ts` | src/shared/contract/report.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/SeasonDef.ts` | src/shared/contract/season.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/SecurityDef.ts` | src/shared/contract/security.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/TeamDef.ts` | src/shared/contract/team.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/endpoints/UserDef.ts` | src/shared/contract/user.rs (definitions + payload/result schemas) | Foundation | done (payload structs: domain) |
| `shared/src/errors.test.ts` | src/shared/errors_tests.rs | Foundation | done |
| `shared/src/errors.ts` | src/shared/errors.rs | Foundation | done |
| `shared/src/schemas/ioAuthAttemptLimit.ts` | src/shared/schemas/auth_attempt_limit.rs | Foundation | done |
| `shared/src/schemas/ioFixture.ts` | src/shared/schemas/fixture.rs | Foundation | done |
| `shared/src/schemas/ioGamedayImport.ts` | src/shared/schemas/gameday_import.rs | Foundation | done |
| `shared/src/schemas/ioMember.ts` | src/shared/schemas/member.rs | Foundation | done |
| `shared/src/schemas/ioReport.ts` | src/shared/schemas/report.rs | Foundation | done |
| `shared/src/schemas/ioSeason.ts` | src/shared/schemas/season.rs | Foundation | done |
| `shared/src/schemas/ioSession.ts` | src/shared/schemas/session.rs | Foundation | done |
| `shared/src/schemas/ioTeam.ts` | src/shared/schemas/team.rs | Foundation | done |
| `shared/src/schemas/ioUser.ts` | src/shared/schemas/user.rs | Foundation | done |
| `shared/src/schemas/ioUserGenderMatching.test.ts` | src/shared/schemas/user_gender_matching.rs (tests) | Foundation | done |
| `shared/src/schemas/ioUserGenderMatching.ts` | src/shared/schemas/user_gender_matching.rs | Foundation | done |
| `shared/src/torva/index.test.ts` | src/shared/torva_tests.rs; regex helpers in src/shared/utils/regex.rs | Foundation | done (ensure.date: see notes) |
| `shared/src/torva/index.ts` | src/shared/torva.rs | Foundation | done |
| `shared/src/utils/endpointDef.test.ts` | src/shared/utils/endpoint_def.rs (tests) | Foundation | done (exactShape: see notes) |
| `shared/src/utils/endpointDef.ts` | src/shared/utils/endpoint_def.rs | Foundation | done |
| `shared/src/utils/regex.ts` | src/shared/utils/regex.rs | Foundation | done |
| `shared/src/utils/reportValidation.test.ts` | src/shared/utils/report_validation.rs (tests) | Foundation | done |
| `shared/src/utils/reportValidation.ts` | src/shared/utils/report_validation.rs | Foundation | done |
| `shared/src/utils/seasonGenderDivision.test.ts` | src/shared/utils/season_gender_division.rs (tests) | Foundation | done |
| `shared/src/utils/seasonGenderDivision.ts` | src/shared/utils/season_gender_division.rs | Foundation | done |
| `shared/src/utils/seasonName.test.ts` | src/shared/utils/season_name.rs (tests) | Foundation | done |
| `shared/src/utils/seasonName.ts` | src/shared/utils/season_name.rs (+ SQLite collation `season_name`) | Foundation | done |

## Binaries reserved for other work

| Binary | Purpose | Owner | Status |
| --- | --- | --- | --- |
| `src/bin/frisbee-server.rs` | The HTTP server (`server/src/index.ts`) | Foundation | done |
| `src/bin/migrate-mongo.rs` | One-off import of the Mongo database into SQLite (use `TableTx::insert_raw` so legacy rows load unchanged; `user.gender` goes in the legacy column) | Migration | pending |
| `src/bin/gameday-export.rs` | `server/src/gameday/exportCli.ts` | Port | pending |

## Inapplicable or adapted tests

- `torva/index.test.ts` › `ensure` › "detects valid dates only": JSON has no
  `Date` values; the Rust test checks `js::date::parse` instead.
- `torva/index.test.ts` › number/timestamp cases with `NaN`/`Infinity`: JSON
  cannot carry them; they are exercised through `coerce()` strings.
- `utils/endpointDef.test.ts` › `exactShape`: a TypeScript-only type helper,
  nothing to port.
- `errors.test.ts` › `instanceof`/identity checks (`toBeInstanceOf`, `toBe(cause)`):
  Rust types make them trivially true; `cause` is kept as a string.
- `db/mongo.test.ts` › connection caching and transaction-support detection:
  Mongo driver details. The commit/rollback cases are ported in `src/db/mod.rs`.
- `db/syncIndexes.test.ts` › missing-namespace and `listIndexes` failures are
  Mongo errors; ported as "a table without indexes gets all of them" and
  "a failing index statement is reported, not swallowed".
- `cluster.test.ts` › worker forking, metrics and load-based scaling: Node
  clustering is replaced by tokio's multi-threaded runtime. The drain on
  shutdown (finish in-flight requests, exit after a timeout) is ported.
- `http/tarpit.test.ts` › "does nothing for a response that has already
  ended": `Tarpit::respond` builds the response, so it cannot run on an
  ended one.
- `test/globalSetup.ts`: no shared database server is needed.
- `seasons.test.ts` › "returns all seasons without a search": the TS suite
  shares one database, so it counts whatever exists; the Rust test creates two
  seasons first in its fresh database and compares against the stored count.
- `security.test.ts` › "returns the current season and auth...": waits 5 ms
  between the two season creations so their `createdOn` differ (the Rust
  server can create both within one millisecond; ties are not broken by `id`).
