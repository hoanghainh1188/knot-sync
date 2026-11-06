# Design: add-sql-source

## Context

Connectors today are file-oriented (`FileEntry` inventory). MCP already serves
documents over stdio with framing and audit. See proposal.md for motivation.
Constraints: never write customer sources; no KnotSync telemetry; secrets only
via env; MIT deps only (`pg`, `mysql2`); plugins for connectors and MCP tools.

**Network note:** Connecting to the customer’s Postgres/MySQL is intentional
local/LAN access. “No network” means no KnotSync cloud/CDN/telemetry—not a ban
on customer database hosts named in `env:` URLs.

## Goals / Non-Goals

**Goals**

- Built-in `postgres` + `mysql` connectors with `url: env:NAME` and `allow:`.
- Read-only sessions; introspection; scan inventory of allowed tables with row
  estimates; MCP schema resource + `describe_table` / `query_table`.

**Non-Goals**

- Other RDBMS; free SQL; writes; Semantic Catalog; pooling dashboards.

## Decisions

### 1. Package and source config shape

Package `packages/connector-sql` exports one plugin (or two thin wrappers)
registering connectors `postgres` and `mysql`.

```ts
export interface SqlAllowTable {
  columns: string[]; // non-empty
}

export interface SqlSourceConfig {
  id: string;
  type: "postgres" | "mysql";
  /** Absolute resolved connection string — NEVER written back to YAML. */
  url: string;
  /** Env var name used (for error messages only). */
  urlEnv: string;
  /** table name → allowed columns */
  allow: Record<string, SqlAllowTable>;
}
```

Widen core:

```ts
export type SourceConfig = FsSourceConfig | SqlSourceConfig;
```

YAML example:

```yaml
sources:
  - id: erp
    type: postgres
    url: env:KNOT_PG_URL
    allow:
      受注:
        columns: [受注番号, 得意先名, 金額]
      hoa_don:
        columns: [ma_kh, so_tien]
```

Parse `url: env:NAME` → read `process.env[NAME]`; reject other `url` shapes.

### 2. Mapping SQL tables onto FileEntry for scan

Keep the existing `connector.scan → FileEntry[] → store.replaceScan` pipeline:

| FileEntry field | SQL mapping |
|---|---|
| `relPath` | table name (as allow key; `/` not used) |
| `absPath` | synthetic `sql://{sourceId}/{table}` (not a filesystem path) |
| `ext` | `""` |
| `type` | `db_row` |
| `size` | row estimate (bigint capped to safe JS number / or bytes-like estimate) |
| `mtimeMs` | `Date.now()` at scan (or 0) |
| `hash` | `null` (hashing skipped for SQL) |

**Alternative:** new inventory tables in SQLite. Rejected for v0.1—too much store
churn; Semantic Catalog can refine later.

`scan.hash` is ignored for SQL connectors. Stats “duplicate/old/empty” will be
mostly zero for SQL; table count shows as `fileCount`. Document in README.

### 3. Read-only driver usage

- **Postgres (`pg`):** on connect, `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`
  or `default_transaction_read_only=on` via startup options / immediate query.
  Introspection via `information_schema` / `pg_catalog` for allowed tables only.
  Row estimate: `pg_class.reltuples` or `COUNT(*)` only if cheap and allow-listed
  — prefer estimate from stats to avoid full scans on huge tables; document choice:
  **use catalog estimates**, fall back to `null`/0 + issue if unavailable.
- **MySQL (`mysql2`):** start transaction with `START TRANSACTION READ ONLY`
  (MySQL 8.0+) or set `transaction_read_only=ON`. Introspect
  `information_schema.COLUMNS` / `STATISTICS`. Row estimate from
  `information_schema.TABLES.TABLE_ROWS`.

Never interpolate identifiers from agent input without quoting from an
allow-list match (exact string equality against `allow` keys/columns).

### 4. Identifier quoting

Maintain dialect-aware quote helpers (`"ident"` vs `` `ident` ``). Table and
column names used in SQL MUST be the allow-list strings after exact match—no
case folding that could widen access unless the DB’s folding is documented;
prefer exact match as configured.

### 5. MCP surfaces

Implemented in `connector-sql` as `mcp-tool` registrations + resource handlers
invoked from `mcp-server` (pass `config` + lazy connection factory):

- Resource template `knot://db/{source}/{table}/schema`
- Tools: `describe_table`, `query_table`

`query_table` input (Zod):

```ts
{
  source: string,
  table: string,
  filters?: Array<
    | { op: "eq"; column: string; value: string | number | boolean | null }
    | { op: "in"; column: string; values: Array<string | number | boolean> }
    | { op: "range"; column: string; min?: string | number; max?: string | number }
    | { op: "contains"; column: string; value: string }
  >,
  limit?: number // default 50, max 200
}
```

Build `WHERE` only from validated ops; always `LIMIT $n`. Frame rows with the
existing `UNTRUSTED_DOCUMENT_CONTENT` helper (shared import from mcp-server or
a tiny shared framing util—prefer reusing mcp-server export to avoid dup).

### 6. Connections lifecycle

Open a connection per scan source (close in `finally`). For MCP, use a small
per-source pool (max 1–2) or connect-per-request; prefer connect-per-request in
v0.1 for simplicity and read-only safety. Timeouts required.

### 7. Testing

- Unit-test URL parsing, allow validation, SQL builder (assert parameterized
  text and values), identifier quoting with JP/VN names.
- Integration: optional—mock driver interfaces; do **not** require Docker in
  default `pnpm test`. If using real drivers in tests, skip unless env fixtures
  present (`describe.skip` pattern) OR use pure mocks.

### 8. Audit / secrets

Audit args: source, table, filter ops/columns, limit, resultCount—never full URL
or password. Report path / audit path checks unchanged (SQL has no filesystem
source path; `path in s` filter already skips).

## Risks / Trade-offs

- **[Risk] FileEntry overload** → Mitigation: document mapping; catalog later.
- **[Risk] Huge COUNT(*)** → Mitigation: estimates only, no forced full count.
- **[Risk] Identifier injection** → Mitigation: allow-list exact match + quote.
- **[Risk] Driver native deps** → `pg`/`mysql2` are pure-JS friendly enough for
  Node; no extra native stack beyond what those packages already ship.

## Migration Plan

- Existing fs-only configs unchanged.
- Rollback: remove plugin registration; SourceConfig union remains backward
  compatible for `fs`.

## Open Questions

None blocking: default `query_table` max rows **200**, default **50**.
