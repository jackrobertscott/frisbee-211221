## File Count

- Prefer the minimum number of new files when refactoring shared features.
- If shared logic can live cleanly in the same new or existing file, do not split it into extra helper/control files.
- Do not add multiple small files for a refactor unless there is a clear structural reason.
- Always make sure the `server` and `browser` packages pass their type checks before finishing.

## Backend Integration

- For paginated or shared list views, implement sorting/filtering behavior in the shared endpoint contract and server handler, not only in browser state.
- When a UI change affects list ordering across requests or pages, update the endpoint payloads and backend logic first, then wire the frontend controls to those server-backed parameters.
- For sorted paginated lists, the sort must be applied in the database query path before `skip`/`limit`. Do not fetch a page unsorted and reorder it in application code.
- All database access outside the DB/table definition layer must go through the typed table helpers (for example `$Report.getMany(...)` or `$Report.aggregate(...)`). Do not call `mongo.collection('...')` or access collections by raw string names anywhere else in the codebase.
