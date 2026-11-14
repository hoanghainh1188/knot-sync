# Tasks

## 1. Catalog Schema, Validation, and Merge Preservation

- [x] 1.1 Add `CatalogLookupJoin` interface and optional `lookupJoins?: CatalogLookupJoin[]` on `CatalogTable` in `packages/catalog/src/types.ts`, and verify TypeScript compilation succeeds (`npm run build -w packages/catalog`)
- [x] 1.2 Update `parseTable` in `packages/catalog/src/load.ts` to validate `lookupJoins` (`name`, `targetTable`, `localColumn`, `targetColumn`, `columns`, `reviewed` defaulting to `false`, duplicate/collision checks) and update `mergeTable` in `packages/catalog/src/merge.ts` to preserve `reviewed: true` `lookupJoins` without auto-approving unreviewed entries
- [x] 1.3 Add `node:test` unit tests in `packages/catalog` covering `lookupJoins` YAML parsing, validation errors, `reviewed: false` defaults, Japanese/Vietnamese column labels, and `mergeCatalog` preservation, and verify all catalog tests pass (`npm test -w packages/catalog`)

## 2. Dual Safety Gate & Lookup Column Resolution

- [x] 2.1 Implement `resolveActiveLookupJoins` and extend column/label/enum resolution in `packages/catalog/src/resolve.ts` (and exports in `packages/catalog/src/index.ts`) so lookup joins are active only when `reviewed: true` AND `source.allow` covers base table/`localColumn` and target table/`targetColumn`/exposed columns, supporting both `<joinName>.<column>` and unique business `label`s
- [x] 2.2 Add `node:test` unit tests in `packages/catalog` verifying active lookup resolution, rejection of `reviewed: false` or non-allow-listed joins/columns, ambiguous label detection, and Japanese/Vietnamese label resolution (`npm test -w packages/catalog`)

## 3. Parameterized LEFT JOIN Query Builder & MCP Integration

- [x] 3.1 Extend `packages/connector-sql/src/query-build.ts` (`QueryJoinSpec`, qualified column references, `LEFT JOIN` clause generation for referenced joins only, `quoteIdent` quoting, and `AS "join.col"` aliases) and verify `npm run build -w packages/connector-sql` succeeds
- [x] 3.2 Update `describe_table` and `handleQueryTable` in `packages/connector-sql/src/mcp-tools.ts` (plus tool schema descriptions if needed) to expose active lookup columns in `describe_table`, resolve lookup columns in `columns`/`filters`/`groupBy`/`orderBy`/`aggregations`, reject unreviewed/disallowed/arbitrary joins before SQL execution, and frame returned rows as untrusted content
- [x] 3.3 Add `node:test` unit and integration tests in `packages/connector-sql` covering single-hop `LEFT JOIN` SQL generation, Japanese/Vietnamese lookup filtering/grouping/ordering, dual-gate rejection (`reviewed: false` and missing `source.allow`), arbitrary `JOIN` syntax rejection, and `describe_table` output (`npm test -w packages/connector-sql`)

## 4. Documentation & Full Verification

- [x] 4.1 Update `README.md`, `packages/cli/README.md`, and `docs/ROADMAP.md` to document pre-approved `lookupJoins` in `knot-sync.catalog.yaml` and update roadmap status, and verify full workspace build and test suite pass (`npm run build && npm test`)
