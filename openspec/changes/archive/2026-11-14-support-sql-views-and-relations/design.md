# Design

## Context

See `proposal.md` for motivation. `packages/connector-sql` introspects tables via `SqlDriver.introspectTable(table)`, `packages/catalog` generates/merges `knot-sync.catalog.yaml`, and `packages/mcp-server` / `packages/connector-sql/src/mcp-tools.ts` enrich `describe_table` and schema resources using the catalog.

## Goals / Non-Goals

**Goals:**
- Support allow-listed SQL Views and Materialized Views seamlessly in PostgreSQL, MySQL, and enterprise SQL connectors under read-only sessions.
- Introspect foreign-key constraints and propagate `references: "<table>.<column>"` for allow-listed target tables/columns into `knot-sync.catalog.yaml`, the local review UI, and `describe_table` MCP output.
- Preserve strict read-only and fully-local guarantees with zero new dependencies.

**Non-Goals:**
- Executing multi-table `JOIN`s in `query_table` (deferred to Issue #56 / `add-catalog-lookup-joins`).
- Cross-database / cross-source foreign key references.
- Allowing un-listed target tables to be exposed via `references` in `describe` drafts.

## Decisions

1. **PostgreSQL Views & Materialized Views (`postgres.ts`)**
   - Query `pg_attribute` + `pg_type` + `pg_class` + `pg_namespace` (filtering `c.relkind IN ('r', 'p', 'v', 'm')`, `a.attnum > 0`, `NOT a.attisdropped`) or fall back to `pg_attribute` when `information_schema.columns` returns 0 rows (since PostgreSQL omits materialized views from `information_schema.columns`). Using `pg_attribute` when `information_schema.columns` is empty preserves existing mock-client test compatibility while supporting materialized views cleanly!
   - Update row-estimate query filter from `c.relkind = 'r'` to `c.relkind IN ('r', 'p', 'v', 'm')`.

2. **Foreign-Key Introspection (`driver.ts`, `postgres.ts`, `mysql.ts`)**
   - Add optional `references?: string` to `ColumnMeta` (format `"<table>.<column>"`).
   - In `postgres.ts`, query `pg_constraint` (`contype = 'f'`) joined with `pg_attribute` and `pg_class`/`pg_namespace` (or `information_schema` key/constraint usage) to map FK columns to `"<ref_table>.<ref_column>"`. Keep FK lookup best-effort if a mock/restricted DB omits it or returns empty rows.
   - In `mysql.ts`, query `information_schema.KEY_COLUMN_USAGE` where `REFERENCED_TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`.
   - In `buildDescribeDraft` (`packages/catalog/src/describe.ts`), only auto-populate `references` when the referenced target table and column are present in `source.allow`, preventing accidental leakage of non-allow-listed table names.

3. **Catalog & UI (`packages/catalog`, `packages/ui`)**
   - Add `references?: string` to `CatalogColumn`. Validate in `parseColumn` (optional non-empty string if present, omit when empty/undefined on serialization so existing catalogs remain unchanged).
   - Preserve `existing.references` in `mergeColumn` when `existing.reviewed === true`, and merge `incoming.references ?? existing.references` when unreviewed.
   - Add an optional `references` text input in `packages/ui` column editor so operators can view or edit `table.column` relations.

4. **MCP Schema Enrichment (`packages/connector-sql/src/mcp-tools.ts`, `packages/mcp-server/src/server.ts`)**
   - Include `references: entry.references || undefined` in enriched column objects returned by `enrichSchemaWithCatalog` and `enrichSchemaForResource`.

5. **Read-only & Fully-local guarantees**
   - All introspection queries run inside read-only sessions (`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` / `START TRANSACTION READ ONLY`), and `references` metadata is stored locally in `knot-sync.catalog.yaml`.

## Risks / Trade-offs

- **Mocked `pg` / `mysql2` clients in existing unit tests**: Existing tests pass fake query handlers that match specific SQL patterns. → Mitigation: Keep `information_schema.columns` as the primary column query (and only query `pg_attribute` when `cols.rows.length === 0`), and treat missing/empty FK query results gracefully.
- **Composite foreign keys**: A multi-column FK maps each column independently to its target column `"<table>.<column>"`, which is sufficient for catalog hints and lookup-join metadata.
