# frisbee

League management for ultimate frisbee competitions.

- www.marlowst.com
- www.perthulti.com

## Packages

| Package | Purpose |
| --- | --- |
| `shared/` | Endpoint contracts (`src/endpoints/*Def.ts`), validation schemas (`src/schemas`, built on the `src/torva` validator), errors and pure domain rules used by both sides. |
| `server/` | Node HTTP API (micro + MongoDB). |
| `browser/` | React + Vite web app. |

### Server layout (`server/src`)

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
- `ui/` vendored component library (do not edit here).
- `utils/` pure helpers.

## Development

Each package installs and runs on its own:

```sh
npm --prefix server run dev      # API on PORT from server/.env
npm --prefix browser run dev     # web app on :3000
```

## Checks

```sh
npm --prefix shared run typecheck && npm --prefix shared test
npm --prefix server run typecheck && npm --prefix server test
npm --prefix browser run typecheck && npm --prefix browser test
```

Server tests include HTTP integration tests (`server/test/integration`) that run the real request pipeline against an in-memory MongoDB (downloaded on first run by `mongodb-memory-server`).

## Deployment

- Server: Docker image (see `Dockerfile`), health check at `/health`.
- Browser: Vercel.
