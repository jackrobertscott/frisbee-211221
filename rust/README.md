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
a fresh SQLite database per test, so they run in parallel. Tests marked
`#[ignore = "pending ..."]` wait on a domain's endpoints; run them with
`cargo test -- --ignored`.

## Point the browser at it

The browser reads the server URL from `VITE_URL_SERVER`. Run the Rust server
on the port you want and set, for example in `browser/.env.local`:

```sh
VITE_URL_SERVER=http://localhost:5000
```

`URL_CLIENT` on the server must match the browser's origin (e.g.
`http://localhost:3000`), as with the TS server. Moving a deployment over:
import the Mongo data with the `migrate-mongo` binary (see `PORTING.md`),
keep `JWT_SECRET` so existing sessions and security codes stay valid, and
replace `MONGODB_URI`/`MONGODB_DB` with `SQLITE_PATH` (on a persistent volume).
