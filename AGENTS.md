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
- Do build browser UI only from the `@ui` component library (`browser/src/ui`) and `lucide-react` icons.
- Do put browser screens in `browser/src/app` and non-visual browser plumbing (auth, router, endpoint hooks) in `browser/src/core`.
- Do check screens at phone and desktop widths; the app is used mostly on mobile.
- Do fix UI issues minimally within the existing components and layouts; keep tables as tables.
- Do show one loading state until a form or dialog has all its initial data, rather than revealing fields as each request lands.
- Do decide wrapping per table column: keep short atomic values (dates, times, places, divisions, names, numbers) on one line, and let long free text (team names, comments) wrap or truncate only where that keeps the table fitting.

## Don't

- Don't use `as any` in TypeScript code.
- Don't implement sorting or filtering only in browser state for paginated or shared list views.
- Don't fetch a page unsorted and reorder it in application code.
- Don't use `id` as a sort field or sort tie-breaker.
- Don't sort returned database data in memory when the database can express the required ordering.
- Don't redesign screens or swap component types (e.g. tables into card lists, frozen/pinned table columns) unless asked.
- Don't apply blanket wrapping rules to every table cell.
- Don't use native UI controls (select, checkbox, date input, etc.) in the browser; use the `@ui` equivalents.
- Don't edit `browser/src/ui` for app-specific needs; it is a vendored copy of the `uilib-261005` library, so change the library and re-copy it.
- Don't call `mongo.collection('...')` or access collections by raw string names outside the DB/table definition layer.

## Facts

- Typed table helper examples include `$Report.getMany(...)` and `$Report.aggregate(...)`.
- The publishing branches are `stage` and `master`.
- The remote is `origin`.
- The browser `@ui` library is vendored from the `uilib-261005` repository (`src/lib`).
- Server integration tests live in `server/test/integration` and drive the real request pipeline against an in-memory MongoDB.
- Team colours must be `hsla(...)` strings from `browser/src/utils/colors.ts`; the server rejects other formats.
