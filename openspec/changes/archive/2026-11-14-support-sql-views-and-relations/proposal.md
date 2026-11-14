# Proposal

## Why

Traditional Japanese and Vietnamese ERP databases normalize business records across multiple tables (for example, `juchu.TKSK_CD` referencing `tokuisaki_mst.TKSK_CD` or `don_hang.ma_kh` referencing `dm_khach_hang.ma_kh`). Because KnotSync currently filters PostgreSQL row estimates to ordinary tables (`c.relkind = 'r'`) and does not capture foreign-key relationships in `knot-sync.catalog.yaml`, IT admins cannot expose pre-joined SQL Views/Materialized Views cleanly and AI agents calling `describe_table` cannot discover master-detail join relationships.

## What Changes

- **SQL Views & Materialized Views Introspection (`packages/connector-sql`)**:
  - Update PostgreSQL driver introspection (`packages/connector-sql/src/postgres.ts`) to support regular tables (`r`), partitioned tables (`p`), Views (`v`), and Materialized Views (`m`) via `c.relkind IN ('r', 'p', 'v', 'm')`, falling back to `pg_attribute` when `information_schema.columns` omits materialized views.
  - Ensure MySQL (`packages/connector-sql/src/mysql.ts`) and enterprise SQL drivers introspect allow-listed Views cleanly under strict read-only sessions.
- **Foreign-Key Introspection & `references` in Semantic Catalog (`packages/connector-sql`, `packages/catalog`, `packages/ui`)**:
  - Add optional `references?: string` (`"<table>.<column>"`) to `ColumnMeta` (`packages/connector-sql/src/driver.ts`) and introspect foreign keys in PostgreSQL (`pg_constraint` / `information_schema`) and MySQL (`information_schema.KEY_COLUMN_USAGE`), filtering to targets inside `source.allow`.
  - Add optional `references?: string` to `CatalogColumn` (`packages/catalog`), validate/serialize it in `loadCatalogFile`/`parseCatalogYaml`, auto-populate it in `buildDescribeDraft` during `knot-sync describe`, preserve it across re-runs when `reviewed: true`, and allow editing it in `packages/ui`.
- **MCP Enrichment (`packages/connector-sql/src/mcp-tools.ts`, `packages/mcp-server/src/server.ts`)**:
  - Surface `references` in `describe_table` and `knot://db/{source}/{table}/schema` enriched column payloads when present in the catalog.
- **Out of scope**: Multi-table `lookupJoins` execution in `query_table` (deferred to Issue #56 / `add-catalog-lookup-joins`), free-form SQL queries, or any write operations against customer databases.
- **No new third-party dependencies.**

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `sql-source`: Introspect allow-listed SQL Views and Materialized Views alongside regular tables, and capture foreign-key target metadata (`references`) for allow-listed target tables/columns.
- `semantic-catalog`: Support optional `references` (`"<table>.<column>"`) on catalog column entries, auto-populate from SQL foreign keys during `describe`, preserve across re-runs when `reviewed: true`, and allow editing in the local UI.
- `catalog-mcp`: Surface column `references` metadata in `describe_table` and `knot://db/{source}/{table}/schema` responses.

## Impact

- `packages/connector-sql/src/driver.ts`, `postgres.ts`, `mysql.ts`, `mcp-tools.ts`, `connector-sql.test.ts`
- `packages/catalog/src/types.ts`, `load.ts`, `merge.ts`, `describe.ts`, `catalog.test.ts`
- `packages/cli/src/describe.ts`
- `packages/mcp-server/src/server.ts`, `mcp-server.test.ts`
- `packages/ui/src/client/types.ts`, `App.tsx`, `i18n.ts`
- `README.md`, `packages/cli/README.md`, `docs/ROADMAP.md`
