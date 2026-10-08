# Agent guide

See [README.md](README.md), [SCOPE.md](SCOPE.md) and
[rust/README.md](rust/README.md).

**The server is `rust/`.** The TypeScript `server/` is deprecated. Make
backend changes in `rust/` only.

When the user states a preference for this codebase, add it to the section
below that it belongs to, written as a plain statement of how things work
here (no "Do" / "Don't" prefixes).

## Before you finish

Every change must pass these, run from the repo root:

```sh
npm --prefix shared run typecheck && npm --prefix shared test
npm --prefix browser run typecheck && npm --prefix browser test
(cd rust && cargo test && cargo clippy --all-targets -- -D warnings)
```

If the change touches the browser, look at the affected screens at both phone
and desktop widths. Most people use the app on their phone.

## Running the dev app

The dev app always runs the latest Rust code. The server starts with
`cargo run --bin frisbee-server` (debug build) from `rust/`, which rebuilds
from the current source first, never from an existing binary in
`rust/target/`. A server that is already running is restarted when it was
built before the latest code changes.

## Git workflow

**One worktree per change.** Make each change in its own git worktree and
branch. When the work is done, merge it back, then remove the worktree and
delete the branch.

**Commit as you go.** Commit after each milestone. Commit messages are short
lowercase word groups, e.g. `fix report sort order`.

**Publishing.** The remote is `origin`; the publishing branches are `stage`
and `master`. When asked to publish:

1. Commit all current changes to `stage`.
2. Merge `stage` into `master`.
3. Push both `stage` and `master` to `origin`.
4. Check out `stage` again.

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

All database access goes through the typed table helpers in
`rust/src/tables` (`REPORT.get_many(...)`). SQL is written only in
`rust/src/db`, `rust/src/tables` and `rust/src/queries`, and even there table
and column names come from the typed definitions (`report::TABLE.sql`,
`Report::TEAM_ID.sql()`), never string literals.

## Sorting, filtering and pagination

These rules apply to any list that is paginated or shared between users.

**The server owns ordering.** Sorting and filtering are part of the shared
endpoint contract and implemented in the server handler, never only in
browser state. When changing how a list is ordered, update the endpoint
payload and backend first, then wire up the frontend controls.

**Sort in the database**, before skip and limit. Never sort returned rows in
memory.

**Sort by real fields.** Use meaningful domain fields (name, date, division,
...). `id` is never a sort field, not even as a tie-breaker.

## Browser UI

### Building blocks

- Build everything from `@ui` components and `lucide-react` icons.
- `browser/src/ui` is a copy of `src/lib` in the `uilib-261005` repository.
  Never edit it for app-specific needs; change `uilib-261005` and copy it
  across again.
- Never use native controls (select, checkbox, date input, ...). Use the
  `@ui` equivalent.

### Screen edges

- The page draws edge to edge (`viewport-fit=cover`). Anything that touches
  a screen edge (header, nav, page, footer, dialogs, toasts, popovers) adds
  the matching safe-area inset so it clears the notch and home indicator.

### Changing existing screens

- Fix UI issues minimally, inside the existing components and layout. Don't
  redesign screens or swap component types (tables into card lists,
  frozen or pinned table columns, ...) unless the user asks.

### Tables

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
- Dialog footers are never sticky. The whole dialog scrolls as one, with the
  footer after the content.
- Dialog bodies never scroll horizontally. Long values wrap within the dialog
  width.
- Stacked card-style radio options render as one connected list: shared
  edges, with only the selected option outlined. Not separate tiles.

### Text

- Database IDs never appear in the UI: not in fields, tables, tooltips or
  messages.
- Button labels have no ellipsis: "Merge", not "Merge…".
