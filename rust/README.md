# Frisbee server (Rust)

A drop-in replacement for the TypeScript server in `server/`, backed by
SQLite instead of MongoDB. The HTTP contract is identical — paths, status
codes, JSON shapes, error bodies, CORS, rate limits and request screening —
so the browser works against either server unchanged.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the code is laid out and
how to add endpoints, and [`PORTING.md`](PORTING.md) for what has been
ported from the TypeScript tree.

## Requirements

- Rust 1.97 or newer (`rustup update`).
- Nothing else: SQLite is compiled in (`rusqlite` with `bundled`).

## Configure

Copy `.env.example` to `.env` in this directory (or the directory you run
the server from) and fill it in. The variables are the TS server's, with one
change: `MONGODB_URI` and `MONGODB_DB` are replaced by `SQLITE_PATH`, the
database file (parent directories are created automatically).

| Variable | Meaning |
| --- | --- |
| `PORT` | Port to listen on (all interfaces, IPv6 dual-stack when available). |
| `APP_NAME` | Sender name for emails. |
| `URL_CLIENT` | The browser app's URL; its origin is the only one allowed. |
| `SQLITE_PATH` | SQLite database file. |
| `JWT_SECRET` | Signs session tokens and security-code digests. Use the TS server's secret to keep existing sessions valid. |
| `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_REGION`, `SES_FROM_EMAIL` | Amazon SES (v2 `SendEmail`). `AWS_REGION` is used when `SES_REGION` is empty. |
| `SESSION_TTL_DAYS` | Session lifetime (default 90). |
| `NODE_ENV` | `production` enables production mode and loads `.env.production` instead of `.env`. |
| `GAMEDAY_IMPORT_SCHEDULER_DISABLED` | `1`, `true`, `yes` or `on` disables the GameDay import scheduler. |
| `GAMEDAY_EXPORT_BIN` | Path of the GameDay exporter binary (default: `gameday-export` next to `frisbee-server`). |
| `GAMEDAY_PROCESS_TIMEOUT_MS` | How long a GameDay export may run (default 10 minutes; falls back to `GAMEDAY_TIMEOUT_MS`). |

GameDay imports run the separate `gameday-export` binary (build it
alongside the server: `cargo build --release --bin gameday-export`). It
drives a locally installed Chrome/Chromium; set
`GAMEDAY_BROWSER_EXECUTABLE_PATH` (or `CHROME_PATH`) if it is not in a
standard location. It reads the TS exporter's other variables too
(`GAMEDAY_HEADLESS`, `GAMEDAY_TIMEOUT_MS`, `GAMEDAY_REPORT_ID`,
`GAMEDAY_FIELDS`, `GAMEDAY_HEADERS`, `GAMEDAY_GENDER_FIELD`,
`GAMEDAY_RECORD_FILTER`, `GAMEDAY_NORMALIZE_HEADERS`, `GAMEDAY_DEBUG`,
`GAMEDAY_DEBUG_DIR`, and their unprefixed fallbacks).

Outside production, security codes are not emailed; they are logged as
`[security-code] <subject> <email> <code> (email delivery skipped in development)`,
exactly like the TS server.

## Run

```sh
cd rust
cargo run --release --bin frisbee-server
```

On start the server applies pending schema migrations, syncs indexes,
runs the data backfills, then listens. In production startup tasks are
retried with backoff for up to four minutes. `SIGTERM`/`SIGINT` stop
accepting connections, let in-flight requests finish (for at most 30
seconds) and exit.

## Test

```sh
cd rust
cargo test                                    # unit + integration tests
cargo clippy --all-targets -- -D warnings     # lints
FRISBEE_LOG_VERBOSE=1 cargo test -- --nocapture   # see server logs in tests
```

Integration tests (`tests/*.rs`) start the real app on an ephemeral port with
a fresh SQLite database per test, so they run in parallel. The one ignored
test, `tests/gameday_export_smoke.rs`, drives a locally installed Chrome; run
it with `cargo test -- --ignored`. [`TEST_PARITY.md`](TEST_PARITY.md) maps
every TS test to the Rust test(s) covering it.

## Deploy (Docker / Railway)

`Dockerfile` (build context: this directory) builds `frisbee-server`,
`gameday-export` and `migrate-mongo` in release mode and copies them into a
Debian slim image with Chromium, fonts and `tini`. The image sets
`NODE_ENV=production`, `PORT=8080`, `SQLITE_PATH=/data/frisbee.sqlite`,
`GAMEDAY_EXPORT_BIN=/app/gameday-export` and
`GAMEDAY_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium`, and runs the server
under `tini` (which reaps Chromium's processes and forwards `SIGTERM`).

```sh
cd rust
docker build -t frisbee-rust .
docker run --rm -p 8080:8080 -v frisbee-data:/data \
  -e APP_NAME=... -e URL_CLIENT=... -e JWT_SECRET=... \
  -e SES_ACCESS_KEY_ID=... -e SES_SECRET_ACCESS_KEY=... -e SES_REGION=... -e SES_FROM_EMAIL=... \
  frisbee-rust
```

On Railway: set the service's root directory to `rust`, point the config
file at `/rust/railway.json` (config files do not follow the root
directory), attach a volume at `/data` (Railway does not allow the
`VOLUME` instruction, so the Dockerfile only sets the path) and set the
variables from `.env.example`. `railway.json` builds with the Dockerfile
and health-checks `/health` with a 300 second timeout, since in production
the server retries its startup tasks for up to four minutes before it
listens. Keep one replica: SQLite has a single writer. To import the Mongo
data on Railway, copy a dump into the volume and run
`/app/migrate-mongo --dump <dump> --sqlite /data/frisbee.sqlite` in the
service shell (`railway ssh`), then redeploy; it refuses to replace a
database that already holds records unless given `--force`.

## Point the browser at it

The browser reads the server URL from `VITE_URL_SERVER`. Run the Rust server
on the port you want and set, for example in `browser/.env.local`:

```sh
VITE_URL_SERVER=http://localhost:5000
```

`URL_CLIENT` on the server must match the browser's origin (e.g.
`http://localhost:3000`), as with the TS server. Moving a deployment over:
import the Mongo data with the `migrate-mongo` binary (see below),
keep `JWT_SECRET` so existing sessions and security codes stay valid, and
replace `MONGODB_URI`/`MONGODB_DB` with `SQLITE_PATH` (on a persistent volume).

## Migrating from MongoDB

`migrate-mongo` loads a `mongodump` of the TS server's database into a new
SQLite file, exactly as the Rust server would have written it. Stop the TS
server (or accept that writes after the dump are lost), then dump the
database. Any of these formats works:

```sh
# a dump directory (plain or gzipped)
mongodump --uri "$MONGODB_URI" --db "$MONGODB_DB" --out dump
mongodump --uri "$MONGODB_URI" --db "$MONGODB_DB" --gzip --out dump
# a single archive file (plain or gzipped)
mongodump --uri "$MONGODB_URI" --db "$MONGODB_DB" --archive=frisbee.archive.gz --gzip
```

Then import it into the file the server will use as `SQLITE_PATH`:

```sh
cd rust
cargo run --release --bin migrate-mongo -- \
  --dump ../dump --sqlite data/frisbee.sqlite --report migrate-report.json
# or: --dump frisbee.archive.gz
```

| Option | Meaning |
| --- | --- |
| `--dump <path>` | A dump root (`dump/`), a database directory (`dump/<db>/`) or an archive file. |
| `--sqlite <path>` | The SQLite database to create (parent directories are created). |
| `--db <name>` | The database to import when the dump holds several (`admin`, `config` and `local` are ignored when choosing automatically). |
| `--force` | Replace the data of a SQLite database that already holds records. Without it the import refuses. |
| `--strict` | Import nothing if any document fails schema validation. |
| `--report <file>` | Write every warning and note, with the dumped values, as JSON. |

The tool applies the server's schema migrations and indexes, then imports
every collection in one transaction (any fatal error leaves the database as
it was; a file the run created is removed) and runs the startup backfills
(`genderMatching` for legacy users). It prints a table per collection (read,
imported, invalid, normalised, warnings) followed by the warnings, and exits
non-zero on fatal errors (unreadable dump, duplicate ids, existing data
without `--force`, `--strict` failures).

How documents are mapped:

- `_id` is dropped; records keep their own `id` (a document without `id`
  uses its `_id` hex, with a warning). Rows keep the dump's (natural) order.
- BSON dates become `toISOString()` strings, ObjectIds hex strings, and
  Int32/Int64/Double/Decimal128 plain numbers (`3.0` is `3`). Other BSON
  types are kept as extended JSON with a warning. A top-level `null` is
  stored as missing (SQLite cannot tell them apart), noted in the report.
- Each field is validated against its schema. Valid fields are stored
  normalised, as `createOne` would. Invalid or missing required fields are
  stored as dumped and reported: the TS server returned such records
  unvalidated, but the Rust server reads records through their types, so
  requests that load them fail until they are fixed (fix them in Mongo and
  import again with `--force`).
- Fields outside the schema (and nested keys the schema strips) have no
  column and are dropped, each reported with its value; the legacy
  `user.gender` is kept for the backfill. After every collection the stored
  rows are read back and compared with the dump, so nothing is lost silently.
- Unknown collections are skipped with a warning.

Keep `JWT_SECRET`: sessions created by the TS server keep working.

## Known differences from the TS server

None of these change what the browser sees in normal use:

- Development-mode error bodies include `lines: ["AppError: <message>"]`
  rather than a full JavaScript stack trace (production omits `lines`, as before).
- JSON object keys follow schema order; MongoDB appended fields set by a
  later update at the end of the document.
- Queries without a sort return rows in insertion order. MongoDB's natural
  order could follow whichever index the planner picked.
- Log wording mentions SQLite instead of Mongo (`Syncing SQLite indexes...`,
  startup task `SQLite schema sync`) and the server always logs `MASTER`:
  Node's cluster workers and load-based scaling are replaced by one
  multi-threaded process (graceful draining on shutdown is kept).
- The season-name and email collations, and the `localeCompare` ordering
  of the export files, are reimplemented (numeric, case/accent-insensitive;
  Unicode lowercase; ICU root order for Latin text and ASCII punctuation)
  instead of using ICU.
- `Date.parse` fallbacks for non-ISO strings are a best-effort port of V8's
  legacy parser; ISO strings behave identically.
- The GameDay exporter drives Chrome over CDP (`chromiumoxide`) instead of
  Playwright: there is no bundled Chromium (the `bundled` channel and the
  fallback after a failed channel launch use any Chrome/Chromium found on
  `PATH`), browser errors read like Playwright's (`page.goto: Timeout
  60000ms exceeded.`) without its call logs, and the report download's
  HTTP client starts from the browser's cookies when the report job starts
  (Playwright shares one live cookie store).
- Production email needs explicit `SES_ACCESS_KEY_ID`/`SES_SECRET_ACCESS_KEY`
  (the AWS SDK's other credential sources are not consulted).
