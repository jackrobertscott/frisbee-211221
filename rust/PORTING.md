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
`tests/integration/x.rs`.

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
| `server/src/endpoints/Feature.ts` | src/endpoints/feature.rs | Feature | done |
| `server/src/endpoints/Fixture.ts` | src/endpoints/fixture.rs | Fixture | done |
| `server/src/endpoints/index.ts` | src/endpoints/mod.rs (`all`) | Foundation | done |
| `server/src/endpoints/Member.ts` | src/endpoints/member.rs | Member | done |
| `server/src/endpoints/Port.ts` | src/endpoints/port.rs | Port | done |
| `server/src/endpoints/Report.ts` | src/endpoints/report.rs | Report | done |
| `server/src/endpoints/Season.ts` | src/endpoints/season.rs | Season | done |
| `server/src/endpoints/Security.ts` | src/endpoints/security.rs | Security | done |
| `server/src/endpoints/Team.ts` | src/endpoints/team.rs | Team | done |
| `server/src/endpoints/User.ts` | src/endpoints/user.rs | User | done |
| `server/src/gameday/credentials.test.ts` | src/gameday/credentials.rs (tests) | Port | done (+ a TS-encrypted fixture) |
| `server/src/gameday/credentials.ts` | src/gameday/credentials.rs | Port | done |
| `server/src/gameday/exportCli.test.ts` | src/gameday/export_cli.rs (tests), tests/integration/gameday_export_cli.rs (process protocol) | Port | done |
| `server/src/gameday/exportCli.ts` | src/bin/gameday-export.rs (+ src/gameday/export_cli.rs) | Port | done |
| `server/src/gameday/exporter.test.ts` | src/gameday/exporter_tests.rs (+ ignored real-Chrome smoke test tests/integration/gameday_export_smoke.rs) | Port | done |
| `server/src/gameday/exporter.ts` | src/gameday/exporter.rs (+ src/gameday/browser.rs, the CDP layer replacing playwright-core) | Port | done |
| `server/src/gameday/importMembers.test.ts` | src/gameday/import_members_tests.rs | Port | done |
| `server/src/gameday/importMembers.ts` | src/gameday/import_members.rs | Port | done |
| `server/src/gameday/runExportProcess.test.ts` | src/gameday/run_export_process_tests.rs | Port | done (fake CLI scripts, see notes) |
| `server/src/gameday/runExportProcess.ts` | src/gameday/run_export_process.rs (+ `GamedayExporter`, src/gameday/mock_exporter.rs) | Port | done |
| `server/src/gameday/scheduler.test.ts` | src/gameday/scheduler_tests.rs | Port | done |
| `server/src/gameday/scheduler.ts` | src/gameday/scheduler.rs | Port | done |
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
| `server/src/queries/mvpLeaderboard.test.ts` | src/queries/mvp_leaderboard.rs (tests) | Feature | done (pipeline shape: see notes) |
| `server/src/queries/mvpLeaderboard.ts` | src/queries/mvp_leaderboard.rs | Feature | done |
| `server/src/queries/reportSearch.test.ts` | src/queries/report_search.rs (tests) | Feature | done (pipeline shape: see notes) |
| `server/src/queries/reportSearch.ts` | src/queries/report_search.rs | Feature | done |
| `server/src/queries/spiritTable.ts` | src/queries/spirit_table.rs | Feature | done |
| `server/src/queries/teamList.test.ts` | src/queries/team_list.rs (tests) | Feature | done (pipeline shape: see notes) |
| `server/src/queries/teamList.ts` | src/queries/team_list.rs | Feature | done |
| `server/src/queries/userList.test.ts` | src/queries/user_list.rs (tests) | User | done (pipeline-shape cases: see notes) |
| `server/src/queries/userList.ts` | src/queries/user_list.rs | User | done |
| `server/src/services/authPayload.ts` | src/services/auth_payload.rs | Security | done |
| `server/src/services/csvImport.test.ts` | src/services/csv_import.rs (tests) | Port | done |
| `server/src/services/csvImport.ts` | src/services/csv_import.rs | Port | done |
| `server/src/services/exportArchive.test.ts` | src/services/export_archive_tests.rs | Port | done |
| `server/src/services/exportArchive.ts` | src/services/export_archive.rs (+ src/js/locale_compare.rs) | Port | done |
| `server/src/services/fixtureSchedule.test.ts` | src/services/fixture_schedule_tests.rs | Fixture | done |
| `server/src/services/fixtureSchedule.ts` | src/services/fixture_schedule.rs | Fixture | done |
| `server/src/services/gamedayImportConfig.test.ts` | src/services/gameday_import_config.rs (tests) | Port | done |
| `server/src/services/gamedayImportConfig.ts` | src/services/gameday_import_config.rs | Port | done |
| `server/src/services/memberImport.ts` | src/services/member_import.rs | Port | done |
| `server/src/services/missingReports.test.ts` | src/services/missing_reports.rs (tests) | Report | done |
| `server/src/services/missingReports.ts` | src/services/missing_reports.rs | Report | done |
| `server/src/services/mockData.test.ts` | src/services/mock_data.rs (tests) | Port | done |
| `server/src/services/mockData.ts` | src/services/mock_data.rs | Port | done |
| `server/src/services/reportMvps.test.ts` | src/services/report_mvps.rs (tests) | Report | done |
| `server/src/services/reportMvps.ts` | src/services/report_mvps.rs | Report | done |
| `server/src/services/roundRobin.test.ts` | src/services/round_robin_tests.rs | Fixture | done |
| `server/src/services/roundRobin.ts` | src/services/round_robin.rs | Fixture | done |
| `server/src/services/seasonDeletion.ts` | src/services/season_deletion.rs | Season | done |
| `server/src/services/spiritStats.test.ts` | src/services/spirit_stats.rs (tests) | Feature | done |
| `server/src/services/spiritStats.ts` | src/services/spirit_stats.rs | Feature | done |
| `server/src/services/teamCaptaincy.ts` | src/services/team_captaincy.rs | Member | done |
| `server/src/services/userEmail.test.ts` | src/services/user_email_tests.rs | Foundation | done |
| `server/src/services/userEmail.ts` | src/services/user_email.rs | Foundation | done |
| `server/src/services/userFields.ts` | src/services/user_fields.rs | Foundation | done |
| `server/src/services/userMerge.test.ts` | src/services/user_merge.rs (tests) | User | done |
| `server/src/services/userMerge.ts` | src/services/user_merge.rs | User | done |
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
| `server/test/actors.ts` | tests/integration/common/actors.rs | Foundation | done |
| `server/test/database.ts` | src/testing.rs (`TestApp`, `TestDir`) | Foundation | done |
| `server/test/globalSetup.ts` | — (no shared server needed: each test opens its own SQLite file) | Foundation | N/A |
| `server/test/harness.ts` | tests/integration/common/mod.rs | Foundation | done |
| `server/test/integration/dashboards.test.ts` | tests/integration/dashboards.rs | Feature | done |
| `server/test/integration/fixtures.test.ts` | tests/integration/fixtures.rs | Fixture | done |
| `server/test/integration/gamedayImport.test.ts` | tests/integration/gameday_import.rs | Port | done |
| `server/test/integration/http.test.ts` | tests/integration/http.rs | Foundation | done |
| `server/test/integration/members.test.ts` | tests/integration/members.rs | Member | done |
| `server/test/integration/migrations.test.ts` | tests/integration/migrations.rs | Foundation | done |
| `server/test/integration/port.test.ts` | tests/integration/port.rs | Port | done |
| `server/test/integration/reports.test.ts` | tests/integration/reports.rs | Report | done |
| `server/test/integration/seasons.test.ts` | tests/integration/seasons.rs | Season | done |
| `server/test/integration/security.test.ts` | tests/integration/security.rs | Security | done |
| `server/test/integration/teams.test.ts` | tests/integration/teams.rs | Team | done |
| `server/test/integration/users.test.ts` | tests/integration/users.rs | User | done |
| `server/test/setup.ts` | src/config.rs (`Config::for_tests`) | Foundation | done |
| `shared/src/auth/authAccess.test.ts` | src/shared/auth_access.rs (tests) | Foundation | done |
| `shared/src/auth/authAccess.ts` | src/shared/auth_access.rs | Foundation | done |
| `shared/src/endpoints/endpointDefs.test.ts` | src/shared/contract/contract_tests.rs | Foundation | done |
| `shared/src/endpoints/FeatureDef.ts` | src/shared/contract/feature.rs (definitions + payload/result schemas; `FeatureAgainstOption`, `FeatureSpiritRow`, `FeatureMvpRow`) | Foundation | done |
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
| `src/bin/migrate-mongo.rs` | One-off import of a `mongodump` (directory, `--gzip`, `--archive`) into SQLite; logic in `src/migrate/` (tests there and in `tests/integration/migrate_mongo.rs`, fixture in `tests/fixtures/mongo/`). See README "Migrating from MongoDB" | Migration | done |
| `src/bin/gameday-export.rs` | `server/src/gameday/exportCli.ts` (protocol in ARCHITECTURE.md) | Port | done |

## Inapplicable or adapted tests

[`TEST_PARITY.md`](TEST_PARITY.md) maps every TS test (with `it.each` rows
and loop-generated tests) to its Rust test(s) with a status and notes; the
list below summarises the main adaptations.

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
- `gameday/exporter.test.ts` › `launchBrowser`: `chromium.launch` and
  `fs.access` mocks become a fake `BrowserLauncher` and a `file_exists`
  closure; `process.execPath` is `std::env::current_exe()`.
- `gameday/exporter.test.ts` › `resolveOptions`: `vi.stubEnv` becomes the
  `env` lookup passed to `resolve_options_with` (tests cannot safely mutate
  the process environment in parallel).
- `gameday/exporter.test.ts` › `runReportAndDownload`: fake timers become
  tokio's paused clock; the tests share a lock so the `Report status:` log
  capture only sees its own lines.
- `gameday/exportCli.test.ts`: the module re-import with a mocked exporter
  becomes `export_cli::run` with an injected exporter (stdin chunks via an
  `AsyncRead` chain); the real binary's stdin/stdout/exit code are checked
  in `tests/integration/gameday_export_cli.rs`. Invalid JSON reports serde_json's
  message (e.g. `expected ident at line 1 column 2`) rather than V8's
  `Unexpected token ...`; the test only checks the prefix, as in TS.
- `userList.test.ts` › `getUserListPipeline` cases assert on the Mongo
  pipeline documents (`$sort`, `$skip`, `$limit`, `$addFields`/`$project`
  of `_sortPrimaryEmail`). The Rust tests assert the equivalent SQL
  (`ORDER BY` keys and directions, `LIMIT`/`OFFSET` after the sort, a zero
  skip and missing limit omitted) and run the email sort against a database;
  the computed sort key never leaves SQL, so there is nothing to project away.
- `userList.ts` email sort: Mongo's `$trim` also strips NUL, which SQLite's
  `trim` cannot be given; stored emails are validated and trimmed, so it
  never matters. `lower()` and `$toLower` both fold ASCII only.
- `users.test.ts`: the TS suite shares one server and creates its admin and
  UserList fixtures in `beforeAll`; each Rust test starts its own server and
  repeats that setup. `it.each('sorts by %s %s')` becomes one test per case.
- `userMerge.ts` reads both users and their memberships inside the merge
  transaction (TS reads them just before it), so the plan and the writes see
  the same data.
- `gameday/runExportProcess.test.ts`: the TS tests replaced `spawn` with a
  fake child. The Rust tests run fake exporter shell scripts through
  `run_gameday_export_command` instead (real pipes, exit codes and SIGTERM).
  "runs the CLI with tsx" becomes a resolution test: the exporter is the
  `gameday-export` binary next to the server (or `GAMEDAY_EXPORT_BIN`). The
  timeout fallbacks (`''`, `nope`, `-1`, the scraper timeout) are checked on
  `read_process_timeout_ms` rather than with fake timers.
- `gameday/importMembers.test.ts`, `gamedayImport.test.ts`: the mocked
  `runGamedayExportProcess` is a `MockExporter` swapped into the app state
  (`AppState::set_gameday_exporter`). "records non-Error failures as text"
  rejects with the error a thrown string becomes (`toAppError('plain failure')`).
- `gameday/scheduler.test.ts`: `runGamedayImportWithHistory` is mocked by
  passing the scheduler an `ImportRunner`; the `setInterval` spy becomes the
  scheduler's own interval (one hour in the test) and the manual
  `nextCheck()` call is `check_due_gameday_imports()`.
- `port.test.ts`, `gamedayImport.test.ts`: the TS suites share one server;
  each Rust test starts its own with its own data.
- `services/exportArchive.test.ts`: the TS `beforeAll` seed runs per test.
- `queries/teamList.test.ts`, `queries/reportSearch.test.ts`,
  `queries/mvpLeaderboard.test.ts`: the TS cases assert on Mongo pipeline
  stages. The Rust tests assert the same rules on the generated SQL (`ORDER
  BY` keys and `LIMIT`/`OFFSET` placement, the vote slots and points per
  season) and run each query against a test database (division/name
  ordering, search before paging, hidden MVP slots).
- `services/roundRobin.test.ts` › "recovers an order reproducing N observed
  rounds for 4 teams": the TS loop generates the 3-round case twice
  (`count - 1 == 3`); it is one Rust test.
- `services/fixtureSchedule.test.ts` › `shuffleInPlace` "returns the same
  array": checked as the same buffer (`as_ptr`) after shuffling in place.

## Notes for the Fixture, Report and Feature domains

- `String.prototype.localeCompare` (spirit table team-name sorts, round-robin
  canonical order) is `js::locale_compare`, an approximation of ICU root
  collation (base letters, then accents, then lowercase-before-uppercase;
  punctuation < digits < letters).
- The spirit dashboard (`FeatureDashboardSpiritLoad`) is not paginated and its
  adjusted averages need every report, so, as in TS, rows are built and
  sorted in Rust (`services::spirit_stats`). The per-team totals and the
  report list come from SQL (`queries::spirit_table`).
- MVP leaderboard ties on the player's team use the first vote in stored
  report order (`_seq`), the SQLite counterpart of Mongo's `$first` over
  natural order.
- Fixture date arithmetic (`shiftFixtureDate`, weekly rounds) uses the
  server's local time zone like the TS `Date` setters; a local time skipped
  by a DST change moves forward by an hour.

