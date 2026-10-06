## Do

- Do add explicit TypeScript types, typed conversions, or proper narrowing.
- Do run and pass the `server` and `browser` package type checks before finishing.
- Do run and pass the `shared`, `server` and `browser` test suites (`npm test`) before finishing.
- Do implement sorting and filtering for paginated or shared list views in the shared endpoint contract and server handler.
- Do update endpoint payloads and backend logic before wiring frontend controls for list ordering changes across requests or pages.
- Do apply sorted paginated list ordering in the database query path before `skip` and `limit`.
- Do use meaningful domain fields for sorting.
- Do prefer database sorting through typed table queries when the database can express the ordering.
- Do use typed table helpers for all database access outside the DB/table definition layer.
- Do commit all current changes to `stage`, merge them into `master`, push both `stage` and `master` to `origin`, then check out `stage` when asked to publish changes.
- Do use short lowercase word groups for commit messages.
- Do commit each milestone's worth of work as it is completed, rather than leaving large amounts of uncommitted changes.
- Do record any preference the user states for this codebase as a rule in this file.
- Do make every change in a dedicated git worktree, merge it back, then remove the worktree and its branch when the work is finished.
- Do build browser UI only from the `@ui` component library (`browser/src/ui`) and `lucide-react` icons.
- Do put browser screens in `browser/src/app` and non-visual browser plumbing (auth, router, endpoint hooks) in `browser/src/core`.
- Do check screens at phone and desktop widths; the app is used mostly on mobile.
- Do fix UI issues minimally within the existing components and layouts; keep tables as tables.
- Do show one loading state until a form or dialog has all its initial data, rather than revealing fields as each request lands.
- Do render stacked card-style radio options as one connected list (shared edges, only the selected option outlined), not separate tiles.
- Do decide wrapping per table column: keep short atomic values (dates, times, places, divisions, names, numbers) on one line, and let long free text (team names, comments) wrap or truncate only where that keeps the table fitting.

## Don't

- Don't use `as any` in TypeScript code.
- Don't implement sorting or filtering only in browser state for paginated or shared list views.
- Don't fetch a page unsorted and reorder it in application code.
- Don't use `id` as a sort field or sort tie-breaker.
- Don't sort returned database data in memory when the database can express the required ordering.
- Don't redesign screens or swap component types (e.g. tables into card lists, frozen/pinned table columns) unless asked.
- Don't apply blanket wrapping rules to every table cell.
- Don't show database IDs anywhere in the UI (fields, tables, tooltips, messages); keep them for keys and requests only.
- Don't let dialog bodies scroll horizontally; long values must wrap within the dialog width.
- Don't give an element a hover style unless the user can interact with it (e.g. table rows only when clickable).
- Don't add an ellipsis (`...` or `…`) to button labels (e.g. "Merge…") unless the user specifically asks for it.
- Don't use native UI controls (select, checkbox, date input, etc.) in the browser; use the `@ui` equivalents.
- Don't edit `browser/src/ui` for app-specific needs; it is a vendored copy of the `uilib-261005` library, so change the library and re-copy it.
- Don't remove or rewrite the TypeScript `server/` while the Rust server in `rust/` is awaiting confirmation; keep both working.
- Don't call `mongo.collection('...')` or access collections by raw string names outside the DB/table definition layer.

## Facts

- Typed table helper examples include `$Report.getMany(...)` and `$Report.aggregate(...)`.
- The publishing branches are `stage` and `master`.
- The remote is `origin`.
- The browser `@ui` library is vendored from the `uilib-261005` repository (`src/lib`).
- Server integration tests live in `server/test/integration` and drive the real request pipeline against an in-memory MongoDB.
- Team colours must be `hsla(...)` strings from `browser/src/utils/colors.ts`; the server rejects other formats.
- Users have a `genderMatching` of only `male` or `female` (no non-binary or other option); it decides which MVP slot (male or female) they can be voted into and is a different concept from gender.
- `rust/` is a Rust/SQLite rewrite of `server/` meant as a drop-in replacement; `rust/README.md` covers running it, migrating a `mongodump`, and the parity harness in `rust/parity/`.
