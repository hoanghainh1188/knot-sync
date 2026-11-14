# Design

## Context

See [proposal.md](./proposal.md) for motivation.

Currently:
- `packages/catalog` defines `CatalogTable` (`label`, `description`, `reviewed`, `columns`) in `types.ts`, validates YAML in `load.ts`, preserves `reviewed: true` entries in `merge.ts`, and resolves column names/labels/enums in `resolve.ts`.
- `packages/connector-sql` builds single-table/view `SELECT` queries in `query-build.ts` (`buildSelectQuery`, `planAggregations`) using dialect-specific `quoteIdent` and bound parameters, and executes them via `handleQueryTable` in `mcp-tools.ts` after checking `source.allow` and framing output via `frameSqlRows`.

This design adds pre-approved, human-reviewed `lookupJoins` across `packages/catalog` and `packages/connector-sql` while preserving read-only, allow-list, and fully-local guarantees.

## Goals / Non-Goals

**Goals:**
- Define `CatalogLookupJoin` on `CatalogTable` with strict YAML validation and `reviewed: true` preservation during `mergeCatalog`.
- Enforce dual gates (`reviewed: true` in catalog AND `source.allow` coverage in config) before any lookup join is surfaced in `describe_table` or executable in `query_table`.
- Generate safe, parameterized single-hop `LEFT JOIN` SQL in `query-build.ts` using `quoteIdent` and qualified column references, joining only the lookup tables actually referenced by the query.
- Support lookup column selection, filtering (including enum validation and PII/untrusted framing), `groupBy`, `orderBy`, and `aggregations`, using either `<joinName>.<column>` or business `label`.

**Non-Goals:**
- Ad-hoc `JOIN` parameters in MCP tools.
- Multi-hop joins (`A -> B -> C`) or non-`LEFT` join types.
- Automatic `reviewed: true` promotion during introspection.

## Decisions

### 1. `CatalogLookupJoin` Schema in `packages/catalog`

Add `CatalogLookupJoin` to `CatalogTable.lookupJoins?: CatalogLookupJoin[]`:
```ts
export interface CatalogLookupJoin {
  name: string;         // Logical alias & prefix for lookup columns (e.g., "tokuisaki")
  targetTable: string;  // Target table or view name (e.g., "tokuisaki_mst")
  localColumn: string;  // Join key on the base table (e.g., "TKSK_CD")
  targetColumn: string; // Join key on the target table (e.g., "TKSK_CD")
  columns: Record<string, CatalogColumn>; // Exposed columns from targetTable
  reviewed?: boolean;   // Must be explicitly true to activate (defaults to false)
}
```
- **Rationale**: Grouping exposed columns under each named `lookupJoins` entry makes human review explicit and self-contained in `knot-sync.catalog.yaml`, avoiding accidental exposure of all columns of `targetTable`.
- **Alternative considered**: Inferring joins from `CatalogColumn.references` automatically. Rejected because `references` does not specify which target columns are safe to expose or whether a human has reviewed the join cardinality/semantics.
- **Validation**: `parseTable` in `load.ts` validates `lookupJoins` as an array of objects with required `name`, `targetTable`, `localColumn`, `targetColumn`, `columns` (reusing `parseColumn`), and optional boolean `reviewed` (defaulting to `false`). Duplicate `name` values within a table's `lookupJoins` or a `name` colliding with the base table name are rejected at load time.

### 2. Dual Safety Gate (`reviewed: true` + `source.allow`)

Introduce a pure helper (e.g., `resolveActiveLookupJoins(baseTable, catalogTable, allowMap)`) that filters `catalogTable.lookupJoins`:
1. `join.reviewed === true`
2. `allowMap[baseTable]` exists and allows `join.localColumn` (either `allowMap[baseTable]` is `true`/all-columns or includes `join.localColumn`)
3. `allowMap[join.targetTable]` exists and allows `join.targetColumn`
4. Only expose `join.columns` entries that are also allowed by `allowMap[join.targetTable]`

If a caller explicitly requests a `<joinName>.<col>` that exists in `catalogTable.lookupJoins` (or a label belonging to it) but fails gate (1) or (2)-(4), `handleQueryTable` throws a descriptive error (`Unreviewed lookup join` or `Disallowed lookup join/column`) without running any SQL.
- **Rationale**: Defense in depth — neither a forgotten `reviewed: false` entry nor a stale catalog entry pointing at a restricted table/column can ever be queried.

### 3. Qualified Column Resolution & Ambiguity Handling

- Base table columns continue to be referenced by their column name (e.g., `JUCHU_NO`) or base `label`.
- Lookup columns are referenced as `<joinName>.<column>` (e.g., `tokuisaki.TKSK_NM`) or by their unique `label` (e.g., `"得意先名"`).
- If a `label` is shared by multiple columns across the base table and active lookup joins, resolution fails with `CatalogResolveError` asking the caller to use the qualified `<joinName>.<column>` name.
- Enum validation (`validateEnumFilter`) and PII/untrusted framing (`frameSqlRows`) apply to lookup columns just like base columns.

### 4. Parameterized `LEFT JOIN` Generation in `query-build.ts`

Extend `BuildSelectQueryInput` with optional `joins?: QueryJoinSpec[]`:
```ts
export interface QueryJoinSpec {
  alias: string;
  targetTable: string;
  localColumn: string;
  targetColumn: string;
}
```
- When `joins` is non-empty, `query-build.ts` qualifies every column reference:
  - Base columns: `quoteIdent(baseAlias) + "." + quoteIdent(col)`
  - Lookup columns (represented in `columns`, `filters`, `groupBy`, `orderBy`, `aggregations` as `{ joinAlias, column }` or `"joinAlias.column"` resolved against active joins): `quoteIdent(joinAlias) + "." + quoteIdent(col)`
- Only joins actually referenced by the query's `columns`, `filters`, `groupBy`, `orderBy`, or `aggregations` are emitted as `LEFT JOIN ${quoteTableRef(j.targetTable, dialect)} AS ${quoteIdent(j.alias)} ON ${quoteIdent(baseAlias)}.${quoteIdent(j.localColumn)} = ${quoteIdent(j.alias)}.${quoteIdent(j.targetColumn)}`.
- **Rationale**: Avoids unnecessary joins when querying only base columns, prevents SQL injection via strict `quoteIdent` + bound parameters, and keeps `query-build.ts` purely structural (it only joins pre-validated specs).

### 5. Read-Only & Fully-Local Guarantees

- **Read-only**: `query_table` continues to generate a single `SELECT` statement executed inside the connector's existing read-only transaction/session with `statement_timeout` and `maxRows` cap.
- **Fully local**: All catalog loading, allow-list checking, identifier quoting, and SQL execution happen locally against the configured database; no network calls, telemetry, or external services are added.
- **Untrusted content framing**: Joined row values pass through `frameSqlRows` unchanged, so values from joined tables are framed as untrusted data.

## Risks / Trade-offs

- **One-to-many join row multiplication** → Mitigation: `lookupJoins` is intended for many-to-one / code-to-name lookups; `maxRows` and `statement_timeout` still bound result size and execution time, and `describe_table` surfaces the join key relationship so human reviewers and agents understand the cardinality.
- **Column name collision in `SELECT` result keys** → Mitigation: Lookup columns in `SELECT` use an explicit alias (`AS ${quoteIdent(joinAlias + "." + col)}` or caller-specified aggregation alias) so they never overwrite base columns with the same name.
- **Label collision between base and lookup columns** → Mitigation: `resolveColumnName` detects ambiguous labels across base + active lookup columns and returns a `CatalogResolveError` instructing the caller to use `<joinName>.<column>`.
