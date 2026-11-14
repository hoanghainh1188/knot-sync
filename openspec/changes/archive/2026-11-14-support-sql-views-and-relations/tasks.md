# Tasks

## 1. SQL View, Materialized View & Foreign-Key Introspection (`packages/connector-sql`)

- [x] 1.1 Extend `ColumnMeta` in `packages/connector-sql/src/driver.ts` with optional `references?: string`, update `packages/connector-sql/src/postgres.ts` to introspect regular/partitioned tables, Views, and Materialized Views (`c.relkind IN ('r', 'p', 'v', 'm')` plus `pg_attribute` fallback when `information_schema.columns` is empty) and foreign keys, and update `packages/connector-sql/src/mysql.ts` to introspect foreign keys from `information_schema.KEY_COLUMN_USAGE`; verify `pnpm build` succeeds.
- [x] 1.2 Add `node:test` cases in `packages/connector-sql/src/connector-sql.test.ts` verifying PostgreSQL view/materialized view column + row estimate introspection, PostgreSQL/MySQL foreign-key `references` detection, and read-only session enforcement, and verify `node --test packages/connector-sql/dist/connector-sql.test.js` passes.

## 2. Semantic Catalog `references` & `describe` Auto-Population (`packages/catalog`, `packages/cli`, `packages/ui`)

- [x] 2.1 Add optional `references?: string` to `CatalogColumn` in `packages/catalog/src/types.ts`, update `parseColumn` (`load.ts`), `mergeColumn` (`merge.ts`, preserving `references` when `reviewed: true`), and `buildDescribeDraft` (`describe.ts` + `packages/cli/src/describe.ts`, populating `references` only when target table and column are allow-listed).
- [x] 2.2 Add an optional `references` (`table.column`) input field to the column editor in `packages/ui/src/client/App.tsx`, `types.ts`, and `i18n.ts` (`en`/`ja`/`vi`); add `node:test` cases in `packages/catalog/src/catalog.test.ts` covering `references` round-trip, `reviewed: true` preservation, and `buildDescribeDraft` allow-list filtering, and verify `pnpm build` + catalog/UI tests pass.

## 3. MCP Schema Enrichment & Documentation (`packages/connector-sql/src/mcp-tools.ts`, `packages/mcp-server`, `docs`)

- [x] 3.1 Surface `references` on enriched columns in `enrichSchemaWithCatalog` (`packages/connector-sql/src/mcp-tools.ts`) and `enrichSchemaForResource` (`packages/mcp-server/src/server.ts`), and add `node:test` coverage in `packages/mcp-server/src/mcp-server.test.ts` for `describe_table` returning `references` metadata on Japanese/Vietnamese ERP columns.
- [x] 3.2 Document SQL Views/Materialized Views and `references` in `README.md` and `packages/cli/README.md`, mark `support-sql-views-and-relations` as `✅ done` in `docs/ROADMAP.md`, and verify the full `pnpm test` suite passes cleanly.
