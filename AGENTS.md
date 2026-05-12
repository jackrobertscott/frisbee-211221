## Do

- Do add explicit TypeScript types, typed conversions, or proper narrowing.
- Do run and pass the `server` and `browser` package type checks before finishing.
- Do implement sorting and filtering for paginated or shared list views in the shared endpoint contract and server handler.
- Do update endpoint payloads and backend logic before wiring frontend controls for list ordering changes across requests or pages.
- Do apply sorted paginated list ordering in the database query path before `skip` and `limit`.
- Do use meaningful domain fields for sorting.
- Do prefer database sorting through typed table queries when the database can express the ordering.
- Do use typed table helpers for all database access outside the DB/table definition layer.
- Do commit all current changes to `stage`, merge them into `master`, push both `stage` and `master` to `origin`, then check out `stage` when asked to publish changes.
- Do use short lowercase word groups for commit messages.

## Don't

- Don't use `as any` in TypeScript code.
- Don't implement sorting or filtering only in browser state for paginated or shared list views.
- Don't fetch a page unsorted and reorder it in application code.
- Don't use `id` as a sort field or sort tie-breaker.
- Don't sort returned database data in memory when the database can express the required ordering.
- Don't call `mongo.collection('...')` or access collections by raw string names outside the DB/table definition layer.

## Facts

- Typed table helper examples include `$Report.getMany(...)` and `$Report.aggregate(...)`.
- The publishing branches are `stage` and `master`.
- The remote is `origin`.
