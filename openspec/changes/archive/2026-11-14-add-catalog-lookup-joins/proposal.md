# Proposal

## Why

Legacy enterprise schemas in Japan and Vietnam frequently store normalized codes on fact tables (for example, `juchu.TKSK_CD` referencing `tokuisaki_mst.TKSK_CD`) without human-readable names. Today, AI agents querying via `query_table` must either issue multiple round-trip calls or receive opaque codes, because `query_table` queries a single table/view at a time and foreign-key `references` metadata is informational only. Adding pre-approved, human-reviewed `lookupJoins` in the Semantic Catalog lets `query_table` execute a safe, single-hop `LEFT JOIN` in one parameterized read-only query while strictly blocking arbitrary SQL joins from MCP arguments.

## What Changes

- Add an optional `lookupJoins` array to `CatalogTable` in `knot-sync.catalog.yaml` (e.g., `name`, `targetTable`, `localColumn`, `targetColumn`, `columns`, `reviewed`), preserving `reviewed: true` entries during `mergeCatalog` / `knot-sync catalog` updates.
- Enforce dual safety gates before any lookup join is active or queryable:
  1. The `lookupJoins` entry in `knot-sync.catalog.yaml` must have `reviewed: true`.
  2. The base table, base join column, target table, target join column, and all exposed target columns must be present in `source.allow` in `knot-sync.config.yaml`.
- Extend `query_table` in `packages/connector-sql` to resolve reviewed, allow-listed lookup columns in `columns`, `filters`, `groupBy`, `orderBy`, and `aggregations`, compiling them into a single parameterized read-only `LEFT JOIN` query with safe `quoteIdent` quoting, `statement_timeout`, and explicit table-qualified references.
- Reject any request referencing unreviewed or disallowed lookup joins/columns cleanly without executing SQL, and never accept arbitrary `JOIN` syntax from MCP tool arguments.
- Surface active (reviewed and allow-listed) lookup columns and join relationships in `describe_table` and enriched catalog MCP descriptions.
- **No new third-party dependencies**: implemented entirely with existing Node.js built-ins and workspace packages.

## Capabilities

### New Capabilities
<!-- None: extends existing semantic-catalog, sql-query, and catalog-mcp capabilities. -->

### Modified Capabilities
- `semantic-catalog`: Add `lookupJoins` schema on `CatalogTable` (`targetTable`, `localColumn`, `targetColumn`, `columns`, `reviewed`) and preserve `reviewed: true` lookup joins across catalog merges.
- `sql-query`: Extend `query_table` to execute single-hop `LEFT JOIN`s for reviewed, allow-listed `lookupJoins` with safe identifier quoting and bound parameters, while rejecting unreviewed or non-allow-listed lookup joins.
- `catalog-mcp`: Surface active reviewed lookup columns in `describe_table` and resolve lookup column names (and business labels) in `query_table` `columns`, `filters`, `groupBy`, `orderBy`, and `aggregations`.

## Out of Scope

- Arbitrary or ad-hoc `JOIN` clauses supplied by MCP clients/agents at query time.
- Multi-hop / chained joins (e.g., `A -> B -> C`) or `INNER` / `RIGHT` / `FULL` / `CROSS` joins (deferred beyond this change).
- Automatic discovery or auto-approval (`reviewed: true`) of `lookupJoins` during `catalog` introspection without human review.
- Write operations, DDL, or paid/v0.3 HTTP/OAuth features.

## Impact

- `packages/catalog`: `types.ts`, `load.ts`, `merge.ts`, `resolve.ts`, and unit tests.
- `packages/connector-sql`: `query-build.ts`, `mcp-tools.ts`, and unit/integration tests.
- Documentation: `README.md`, `packages/cli/README.md`, `docs/ROADMAP.md`.
- Dependencies: None (no new third-party dependencies).
