# Architecture

A guide for porting endpoint domains onto this foundation. The TS code is
the spec: when unsure how something should behave, read the TS file and its
tests and match them, including over HTTP and in stored data.

## Module layout

```
src/
  bin/frisbee-server.rs   the server binary
  bin/migrate-mongo.rs    imports a mongodump into SQLite (logic in migrate/)
  bin/gameday-export.rs   the GameDay exporter process (see below)
  lib.rs
  js/                     JavaScript semantics: trim, Number(), String(n),
                          JSON.stringify numbers, Date.parse/toISOString,
                          localeCompare
  log.rs                  console.log/warn/error, plus capture for tests
  config.rs               config.ts (SQLITE_PATH replaces MONGODB_*)
  shared/                 shared/src
    torva.rs              the io.* validation library
    errors.rs             AppError, factories, user messages, serialisation
    auth_access.rs        access points and rules
    schemas/              record schemas (io_*) + typed record structs
    contract/             every *Def.ts: EndpointDef + payload/result schemas
    utils/                regex, seasonName, seasonGenderDivision, ...
  db/                     SQLite layer (only place, with tables/ and queries/,
    mod.rs                that writes SQL): Db handle, transactions, savepoints
    schema.rs             TableDef/ColumnDef/IndexDef, Col<T>, value mapping
    filter.rs             Filter, SortKey, Query (sort/skip/limit)
    table.rs              Table<T> helpers (table.ts) and Patch
    migrations.rs         versioned schema migrations + index sync
    audit.rs              schema audit (schemaAudit.ts)
  tables/                 one module per table: typed columns + TableDef
  http/                   the request pipeline (http/*.ts)
    endpoint.rs           Endpoint (createEndpoint) and Ctx (the request)
  auth/                   jwt, hash, sessions, attempt limits, require_*
  endpoints/              one module per domain: pub fn routes() -> Vec<Endpoint>
  services/               services/*.ts, one module per TS service
  queries/                queries/*.ts (joins, aggregates, computed sorts)
  gameday/                gameday/*.ts: types, exporter (+ browser, the CDP
                          wrapper), export_cli, credentials, the exporter process
                          (GamedayExporter, swappable in AppState for
                          tests), member import with run history, scheduler
  migrations/             data backfills run at startup
  migrate/                the Mongo import: dump reading, BSON conversion
  startup.rs              startup tasks with production retry
  server.rs               bootstrap, serve, graceful drain
  app.rs                  AppState (config, db, mailer, codes, screening)
  testing.rs              TestApp/TestDir for unit and integration tests
tests/
  common/                 harness.ts + actors.ts
  http.rs, migrations.rs  integration tests (one file per TS test file)
```

## Declaring an endpoint

Definitions (path, access point, payload and result schemas) already exist
in `shared::contract::<domain>`. Register a handler for each in your
domain's `endpoints/<domain>.rs`:

```rust
use crate::http::endpoint::{Ctx, Endpoint};
use crate::shared::contract::season::{SEASON_CREATE, SEASON_LIST};
use crate::db::{Filter, Patch, Query};
use crate::shared::schemas::Season;
use crate::tables::SEASON;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SeasonListPayload {
    search: Option<String>,
}

pub fn routes() -> Vec<Endpoint> {
    vec![
        Endpoint::new(&SEASON_LIST, |payload: SeasonListPayload, ctx: Ctx| async move {
            let sort = Season::NAME.desc().collate(crate::db::Collation::SeasonName);
            SEASON
                .get_many(ctx.db(), Season::NAME.contains_ci(payload.search.unwrap_or_default()), Query::new().sort([sort]))
                .await
        }),
        Endpoint::new(&SEASON_CREATE, |payload: serde_json::Value, ctx: Ctx| async move {
            ctx.require_access().await?;          // requireAccess(req, access)
            SEASON.create_one(ctx.db(), payload).await
        }),
    ]
}
```

- `Endpoint::new(def, handler)`: the handler gets the payload **after**
  validation against `def.payload` (normalised: trimmed strings, ISO dates,
  unknown keys dropped), deserialised into your type `P`. Use a struct with
  `#[serde(rename_all = "camelCase")]`, `serde_json::Value`, `String` for
  bare-id payloads, or `()` when the definition has no payload.
  `Option<Option<T>>` with `shared::schemas::double_option` distinguishes
  "omitted" from `null` (e.g. `ReportUpdate` MVPs).
- Return any `Serialize` value. Objects/arrays become `200` JSON; `()` and
  `None` become an empty `204` (the TS `return null/undefined`). Strings or
  numbers are rejected with `request.invalid_handler_response`, as in TS.
- `Endpoint::raw(def, handler)` returns a `Reply` directly — use
  `Reply::Response(...)` for downloads (`PortExport`). CORS headers are added
  by the pipeline.
- `.unsafe_origin()` is the TS `unsafe: true`.
- Multipart endpoints (`def.multipart`): the body is not read; call
  `http::uploads::digest_request(&ctx.headers, ctx.take_body().unwrap_or_default(), &UploadOptions::default())`
  and `filepath_buffer(path)`.

`Ctx` is the TS `req`: `ctx.db()`, `ctx.config()`, `ctx.state` (mailer,
security codes), `ctx.header("name")` (Node semantics), `ctx.client_ip()`
(`intrusion.getClientIp`), `ctx.require_user()`, `ctx.require_access()`
(uses the definition's access point), `ctx.require_access_point(point)`, and
`auth::require::require_team(db, user_id, team_id)`.

The pipeline before your handler (do not repeat it): OPTIONS → `{}`;
`/`, `/health`, `/robots.txt`, `/favicon.ico`; intrusion screening; unknown
route → 404; non-POST → 405; origin check → 403; `json(req)` (1mb, `Invalid
JSON`); `{payload}` wrapper → 400; schema validation → 422 with the TS
"An error occurred: ..." message and friendly `userMessage`.

## Errors

Raise errors with the factories in `shared::errors`, mirroring the TS calls:

```rust
use crate::shared::errors::{conflict_error, ErrorOptions};
return Err(conflict_error("User is already a member of another team.", ErrorOptions::code("member.already_on_other_team")));
```

`ErrorOptions` builders: `code`, `with_user_message`, `with_details`,
`with_meta`, `with_tarpit`. `AppResult<T>` = `Result<T, AppError>`; `?`
converts rusqlite/serde/io errors into internal (500) errors. Fields are
read through `Deref` (`error.error_code`). Error bodies, logging, tarpits and
production redaction are handled by `http::capture`.

## Database

`Db` is a pooled SQLite handle (WAL, busy timeout, custom collations
`ci` and `season_name`, function `contains_ci`). Tables are constants in
`crate::tables` (`USER`, `TEAM`, ...), each a `Table<T>` with typed columns on
the record type (`Team::NAME`, `Member::PENDING`, `User::EMAILS`).

Async helpers (one pooled connection each), mirroring `table.ts`:

| TS | Rust |
| --- | --- |
| `$T.count(q)` | `T.count(db, filter)` |
| `$T.maybeOne(q)` / `{sort}` | `T.maybe_one(db, filter)` / `T.maybe_one_sorted(db, filter, query)` |
| `$T.getOne(q)` | `T.get_one(db, filter)` (404 `db.record_not_found`) |
| `$T.getMany(q, {sort, skip, limit})` | `T.get_many(db, filter, Query::new().sort([...]).skip(n).limit(n))` |
| `$T.createOne(v)` / `createMany` | `T.create_one(db, value)` / `T.create_many(db, values)` — defaults (`id`, `createdOn`, `updatedOn`, ...) + schema validation |
| `$T.updateOne(q, v)` | `T.update_one(db, filter, Patch)` — merge, validate, write changed fields only |
| `$T.updateMany(q, v)` | `T.update_many(db, filter, Patch)` — raw, returns rows changed |
| `$T.updateBulk(tasks)` | `T.update_bulk(db, vec![(filter, patch)])` — all or nothing |
| `$T.updateAtomic(q, u, opts)` | `T.find_one_and_update(db, filter, AtomicUpdate, upsert, ReturnDocument)` |
| `$T.deleteOne` / `deleteMany` | `T.delete_one(db, filter)` / `T.delete_many(db, filter)` |
| `$T.scanStored(cb, q)` | `T.scan_stored(db, filter)` (raw JSON rows) |
| `$T.aggregate(...)` | a query function in `crate::queries` (see below) |

Values to create are any `Serialize` (a camelCase struct or `json!({...})`);
missing defaulted fields are filled in. `updatedOn` is never bumped
implicitly — set it in the patch when the TS code does.

Filters: `Col::eq/ne/gt/gte/lt/lte/is_in/not_in/exists/missing`,
`Col<String>::contains_ci` (`regex.from(search)`), `eq_ci`/`in_ci` (email
collation), `User::EMAILS.any(UserEmail::VALUE.eq_ci(email))` (array
element match), `Filter::and([...])`, `Filter::or([...])`,
`filter.and_also(other)`, `Filter::all()`. Missing fields behave like Mongo:
`eq`/`in`/comparisons never match them, `ne`/`not_in` do.

Patches: `Patch::new().set(Col, value).set_opt(Col, option).unset(Col)`,
`.set_list(&User::EMAILS, &emails)`, `Patch::from_object(map)` (spread a
validated payload object).

Transactions (replace `mongo.transaction`): run synchronous helpers on one
connection with `Table::tx`; any `Err` rolls everything back.

```rust
ctx.db().transaction(move |c| {
    MEMBER.tx(c).delete_many(&Member::TEAM_ID.eq(&team_id))?;
    TEAM.tx(c).delete_one(&Team::ID.eq(&team_id))?;
    Ok(())
}).await?;
```

`db.call(|c| ...)` runs synchronous work without a transaction.

### Queries (`crate::queries`)

Port `queries/*.ts` aggregates as functions taking `&Connection`. SQL may
only be written in `crate::db`, `crate::tables` and `crate::queries`; take
table and column names from the definitions (`team::TABLE.sql`,
`Team::NAME.sql()`), never as scattered literals. For record results use
`TEAM.tx(c).select_where("WHERE ... ORDER BY ... LIMIT ? OFFSET ?", &params)`
(alias `t`; build conditions with `filter.to_sql("t", &mut params)`), which
loads child arrays too. Rules from `AGENTS.md` apply:

- sort and filter in SQL **before** `LIMIT`/`OFFSET`; never fetch a page
  unsorted and reorder it in Rust;
- never sort by `id` or use it as a tie-breaker (`Query` refuses to). Unsorted
  queries return insertion order (`_seq`, the Mongo natural order);
- use domain fields for sorting; season names sort with
  `Collation::SeasonName`, emails compare with `Collation::CaseInsensitive`.

### Storage model

One row per record, one column per top-level field (snake_case names, no
declared type so values keep their JSON type; `NULL` = missing). Booleans
are `0/1`; numbers are SQLite integers/reals; `fixture.games`,
`season.finalResults` and `user.userMergedIds` are JSON text (query them with
`json_each`/`json_extract`); `user.emails` lives in the `user_email` child
table (`user_id`, `position`, `value`, `verified`, `code`, `created_on`,
`is_primary`), maintained by the table layer and deleted with the user.
Schema changes are new numbered entries in `db::migrations::MIGRATIONS`
(never edit an applied one); indexes are declared on the `TableDef` and
synced at startup.

## Tests

Port every TS test with the same cases and assertions. Names become
snake_case and `describe` blocks become nested modules:
`describe('userEmail.remove') > it('moves primary to the next email...')`
→ `mod user_email_remove { #[tokio::test] async fn moves_primary_to_the_next_email_... }`.

Unit tests live next to the code (`#[cfg(test)] mod tests` or a
`foo_tests.rs` included with `#[path]`). For database tests use
`testing::TestApp::new(vec![])` (fresh migrated database, captured email,
dev config; `TestApp::with_config` to tweak, e.g. `is_production = true`).

Integration tests are `tests/<ts file name>.rs` with `mod common;`:

```rust
mod common;
use common::{actors::{sign_up, create_season, SignUp}, assert_match, CallOptions, TestServer};
use serde_json::json;

#[tokio::test]
async fn admins_can_create_seasons() {
    let server = TestServer::start().await;                 // real app, fresh DB
    let admin = sign_up(&server, SignUp { admin: true, ..Default::default() }).await;
    let season = create_season(&server, &admin, json!({"name": "Winter"})).await;
    let response = server.post_as("/SeasonList", json!({}), &admin.token).await;
    assert_eq!(response.status, 200);
    assert_match(&response.body, &json!([{"id": season["id"]}]));
}
```

`server.call(path, Some(payload) | None, CallOptions)` returns `{status,
body, headers}` (`None` sends `{}` — the TS `payload: undefined`);
`server.latest_code(email)` reads the last security code;
`server.db()` gives typed table access for setup and assertions;
`assert_match` is `toMatchObject`. Logs are global and tests run in
parallel: when asserting on log lines with `log::capture()`, filter on
something unique to the test.

## GameDay exporter (`gameday-export`)

The headless-browser scraper runs as its own process, as in TS
(`exportCli.ts`, spawned by `runExportProcess.ts`). Build it with
`cargo build --release --bin gameday-export`; it ends up next to
`frisbee-server` in `target/release/`.

Protocol (mirrors `exportCli.ts` exactly):

| Channel | Content |
| --- | --- |
| stdin | One JSON object, read to EOF: `GamedayExportInput` (`TGamedayExportInput`), validated by `gameday::types::parse_gameday_export_input`. |
| stdout | Success only: `serde_json` of `GamedayExportOutput`, i.e. `{"members":[{"teamName","firstName","lastName","email","gender"}]}`, compact, no trailing newline. Nothing else is written to stdout. |
| stderr | Progress lines (`Opening GameDay...`, `Report status: Complete`, ...) and, on failure, a last line `GameDay export failed: <message>` (bad JSON, a validation message such as `username is required.`, or the exporter's error). |
| exit code | `0` success, `1` any failure; `143`/`130`/`129` after `SIGTERM`/`SIGINT`/`SIGHUP` (the browser is killed and its temporary profile removed first). |

The spawning side (`run_export_process.rs`) should therefore: write
`serde_json::to_string(&input)` to stdin and close it; on a non-zero exit use
the stderr tail for `gameday.export_failed`; otherwise parse stdout and check
it with `gameday::types::is_gameday_export_output`; kill the child with
`SIGTERM` on timeout. Resolve the binary next to the running executable
(`std::env::current_exe()?.with_file_name("gameday-export")`) and pass the
environment minus server secrets, as `runExportProcess.ts` does.

Inside the process: `gameday::exporter` is `exporter.ts` (options, field
resolution, CSV parsing, the report polling) and drives Chrome through
`gameday::browser` (`chromiumoxide` over CDP; a Playwright-like `ChromePage`
with `goto`, `fill`, `click`, `waitForURL`, ...). Chrome is found from
`browserExecutablePath` / `GAMEDAY_BROWSER_EXECUTABLE_PATH` /
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` / `CHROME_PATH`, then the TS list of
common install paths (including `/Applications/Google Chrome.app` on macOS),
then the browser channel's install location, then any Chrome/Chromium on
`PATH`. The tests fake `BrowserLauncher` (`chromium.launch`) and
`ReportRequestContext` (`context.request`); `tests/gameday_export_smoke.rs`
(`#[ignore]`) runs a full export in a real Chrome against intercepted
fixture pages.

## JSON parity rules

- Keys are camelCase (`#[serde(rename_all = "camelCase")]`); optional fields
  are omitted when `None` (`skip_serializing_if = "Option::is_none"`), as
  Mongo documents omit missing keys. Use `double_option` where `null` must
  survive.
- Numbers print like `JSON.stringify`: whole floats as integers (`3`, not
  `3.0`), `-0` as `0`. The pipeline normalises every response; use
  `js::number(f64)` when building `Value`s yourself.
- Dates are ISO strings with milliseconds and `Z` (`js::date::now_iso()`,
  `js::date::to_iso_string(ms)`); parse with `js::date::parse` (`Date.parse`).
- Use `js::trim` (not `str::trim`) for JavaScript `.trim()`, and
  `js::string_to_number` for `Number(text)`.
- Key order follows the schema; the browser does not depend on it.
