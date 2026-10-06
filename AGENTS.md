# Agent guide

How to work in this repository. Read [README.md](README.md) for the package
layout and commands, [SCOPE.md](SCOPE.md) for what the app does, and
[rust/README.md](rust/README.md) for the Rust server.

When the user states a preference for this codebase, add it to the section
below that it belongs to, written as a plain statement of how things work
here (no "Do" / "Don't" prefixes).

## Before you finish

Every change must pass these, run from the repo root:

```sh
npm --prefix shared run typecheck && npm --prefix shared test
npm --prefix server run typecheck && npm --prefix server test
npm --prefix browser run typecheck && npm --prefix browser test
```

If the change touches the browser, look at the affected screens at both phone
and desktop widths. Most people use the app on their phone.

## Git workflow

**One worktree per change.** Make each change in its own git worktree and
branch. When the work is done, merge it back, then remove the worktree and
delete the branch.

**Commit as you go.** Commit after each milestone instead of building up a
large uncommitted diff. Commit messages are short lowercase word groups, e.g.
`fix report sort order`.

**Publishing.** The remote is `origin`; the publishing branches are `stage`
and `master`. When asked to publish:

1. Commit all current changes to `stage`.
2. Merge `stage` into `master`.
3. Push both `stage` and `master` to `origin`.
4. Check out `stage` again.

## Project landmarks

| Path | What to know |
| --- | --- |
| `shared/` | Endpoint contracts and validation used by both server and browser. |
| `server/` | TypeScript API on MongoDB. Integration tests in `server/test/integration` run the real request pipeline against an in-memory MongoDB. |
| `rust/` | Rust/SQLite rewrite of `server/`, meant as a drop-in replacement. Its README covers running it, migrating a `mongodump`, and the parity harness in `rust/parity/`. |
| `browser/src/app` | Screens. |
| `browser/src/core` | Non-visual browser plumbing: auth, router, endpoint hooks. |
| `browser/src/ui` | The `@ui` component library, vendored from `src/lib` in the `uilib-261005` repository. |

**Keep both servers working.** The Rust server is awaiting confirmation, so
the TypeScript `server/` must not be removed or rewritten in the meantime.

**The `@ui` folder is a copy.** Never edit `browser/src/ui` for app-specific
needs. Change `uilib-261005` and copy it across again.

## Domain rules

- **Team colours** are `hsla(...)` strings taken from
  `browser/src/utils/colors.ts`. The server rejects any other format.
- **Gender matching.** Every user has a `genderMatching` of `male` or
  `female`; there is no other option. It decides which MVP slot (male or
  female) a player can be voted into, and is a separate concept from gender.

## TypeScript

Give values explicit types and narrow them properly (typed conversions, type
guards). `as any` is never acceptable.

## Database access

All database access outside the DB/table definition layer goes through the
typed table helpers, such as `$Report.getMany(...)` and
`$Report.aggregate(...)`. Calling `mongo.collection('...')` or naming a
collection by string anywhere else is not allowed.

## Sorting, filtering and pagination

These rules apply to any list that is paginated or shared between users.

**The server owns ordering.** Sorting and filtering are part of the shared
endpoint contract and implemented in the server handler, never only in
browser state. When changing how a list is ordered, update the endpoint
payload and backend first, then wire up the frontend controls.

**Sort in the database.** Apply the sort in the query, before `skip` and
`limit`, using typed table queries. Fetching a page unsorted and reordering it
in code is wrong, as is sorting returned rows in memory when the database
could have done it.

**Sort by real fields.** Use meaningful domain fields (name, date, division,
...). `id` is never a sort field, not even as a tie-breaker.

## Browser UI

### Building blocks

- Build everything from `@ui` components and `lucide-react` icons.
- Never use native controls (select, checkbox, date input, ...). Use the
  `@ui` equivalent.

### Changing existing screens

- Fix UI issues minimally, inside the existing components and layout.
- Don't redesign screens or swap component types (tables into card lists,
  frozen or pinned table columns, ...) unless the user asks.

### Tables

- Tables stay tables.
- Decide wrapping per column, not with a blanket rule:
  - short atomic values (dates, times, places, divisions, names, numbers)
    stay on one line;
  - long free text (team names, comments) wraps or truncates, and only where
    that is what keeps the table fitting.
- Rows get a hover style only when they are clickable. The same goes for any
  other element: no hover style without an interaction.

### Forms and dialogs

- Show a single loading state until the form or dialog has all of its initial
  data. Don't reveal fields one by one as requests land.
- Dialog bodies never scroll horizontally. Long values wrap within the dialog
  width.
- Stacked card-style radio options render as one connected list: shared
  edges, with only the selected option outlined. Not separate tiles.

### Text

- Database IDs never appear in the UI: not in fields, tables, tooltips or
  messages. Use them only for keys and requests.
- Button labels have no ellipsis (`...` or `…`), e.g. "Merge" not "Merge…",
  unless the user asks for one.
