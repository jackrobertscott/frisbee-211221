# frisbee

League management for ultimate frisbee competitions.

- www.marlowst.com
- www.perthulti.com

| Document | Read it for |
| --- | --- |
| [SCOPE.md](SCOPE.md) | What the app does, screen by screen. |
| [AGENTS.md](AGENTS.md) | How to work in this repo: workflow, checks and coding rules. |
| [rust/README.md](rust/README.md) | The Rust/SQLite server. |

## Packages

| Package | Purpose |
| --- | --- |
| `shared/` | Endpoint contracts (`src/endpoints/*Def.ts`), validation schemas (`src/schemas`, built on the `src/torva` validator), errors and pure domain rules used by both sides. |
| `rust/` | HTTP API (Rust + SQLite). |
| `browser/` | React + Vite web app. |
| `server/` | Deprecated Node/MongoDB API, replaced by `rust/`. |

### Deprecated TS server layout (`server/src`)

- `endpoints/` thin HTTP handlers, one module per shared `*Def.ts` contract.
- `services/` domain logic the handlers delegate to.
- `queries/` MongoDB aggregation pipeline builders for list and dashboard views.
- `tables/` typed table helpers (`$Report.getMany(...)`); the only way to reach the database.
- `db/` table factory, Mongo connection and index sync.
- `http/` request pipeline: CORS, error capture, intrusion screening, uploads.
- `auth/` sessions, passwords, rate limits and access checks.
- `gameday/` GameDay member export scraper and scheduled imports.

### Browser layout (`browser/src`)

- `app/` screens, grouped by feature (`fixtures/`, `ladder/`, `reports/`, `teams/`, ...); `app/common/` holds small shared compositions and `app/shell/` the dashboard frame.
- `core/` non-visual plumbing: auth, router, endpoint clients and hooks.
- `ui/` the `@ui` component library, vendored from `uilib-261005`; change it there and copy it back.
- `utils/` pure helpers.

## Development

Each package installs and runs on its own:

```sh
(cd rust && cargo run --release --bin frisbee-server)   # API, see rust/README.md
npm --prefix browser run dev     # web app on :3000
```

## Checks

```sh
npm --prefix shared run typecheck && npm --prefix shared test
npm --prefix browser run typecheck && npm --prefix browser test
(cd rust && cargo test && cargo clippy --all-targets -- -D warnings)
```

## Deployment

- Server: Docker image (see `rust/Dockerfile` and `rust/README.md`), health check at `/health`.
- Browser: Vercel.
