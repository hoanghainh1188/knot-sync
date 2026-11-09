# Design

## Context

See proposal.md — Why. Today `createPostgresDriver` uses `pg.Client` and
hard-codes `table_schema = 'public'` / `nspname = 'public'`. MySQL uses
`DATABASE()`. `buildSelectQuery` supports `eq` | `in` | `range` | `contains`
only; `eq` with `null` already emits `IS NULL`. Drivers are created per scan /
tool call and closed afterward.

Read-only and local guarantees: connections still use env-only URLs, read-only
session mode, allow-listed identifiers, and parameterized SQL. No telemetry or
extra network destinations—only the customer DB URL the operator already
configured.

## Goals / Non-Goals

**Goals:**

- One configurable Postgres schema per source (default `public`).
- Capped pools + statement timeout on every borrowed connection.
- Three new filter ops for common JP/VN business queries.
- Keep allow-list + parameterized SQL as the only query path.

**Non-Goals:**

- Multi-schema allow-lists in one source (one schema per source).
- Cross-schema joins or free SQL.
- Changing MySQL “schema” semantics beyond rejecting the key.
- Global process-wide pool shared across unrelated source ids (pool is
  per driver instance / source connection lifecycle).

## Decisions

### 1. `schema` on postgres `SqlSourceConfig` only

- **Choice:** Optional `schema?: string` on postgres sources; default
  `"public"` when omitted. MySQL parse rejects `schema`.
- **Why:** Matches ROADMAP; MySQL already scopes via connection database.
- **Alternatives:** Schema-qualified table names in `allow` keys (`経理.請求`) —
  rejected as a breaking allow-list shape and harder catalog mapping.

### 2. Schema-qualified FROM / introspection bind params

- Pass `schema` into the Postgres driver factory / `SqlDriver` (extend
  factory options or close over config).
- Introspection SQL: bind `$schema` instead of literal `'public'` for
  `information_schema` and `pg_namespace`.
- `buildSelectQuery`: for postgres, `FROM "schema"."table"` via
  `quoteIdent(schema)` + `quoteIdent(table)` when schema is set (always for
  postgres with effective schema).
- Allow-list keys remain bare table names (no schema prefix).

### 3. Pooling with existing libraries

- **Postgres:** `pg.Pool` with `max` default **4** (small CLI/MCP process;
  avoid hammering customer DB). `connectionTimeoutMillis` keep ~15s.
- **MySQL:** `mysql2/promise.createPool` with same `max` default.
- On acquire / connect: enable read-only + set timeout (below), then query;
  release client back to pool. `close()` → `pool.end()`.
- **Alternatives:** Keep single Client — rejected (no reuse, no max
  concurrency control under concurrent MCP tools later).

### 4. Statement timeout defaults

- **Postgres:** `SET statement_timeout = '5000'` (or ms integer) on each
  session after checkout / in pool `connect` hook.
- **MySQL:** `SET SESSION MAX_EXECUTION_TIME = 5000` (ms) for SELECT
  (MySQL 5.7.8+). Document that older servers may ignore; still set best-effort.
- Optional source key `statementTimeoutMs` (positive integer, default 5000)
  if cheap to parse; otherwise hard-code default in this change and document.
  **Choice:** add optional `statementTimeoutMs` on SQL sources (both dialects)
  for operator override without a top-level config section.
- Pool `max` optional override `poolMax` deferred unless trivial; default 4
  is enough for this change (document constant; no config key unless needed).

### 5. New filter operators

| Op | SQL shape | Notes |
|---|---|---|
| `starts_with` | `col LIKE $n` with `value%` (escaped LIKE) | Prefix only |
| `between_dates` | `col >= $from AND col <= $to` | Require both bounds; values as ISO date/datetime strings; same as inclusive range but dedicated op for MCP clarity |
| `is_null` | `col IS NULL` / `col IS NOT NULL` | Boolean flag; distinct from `eq`+null for tool schema clarity |

- Keep existing `range` for numeric/generic bounds.
- Catalog enum validation: apply to `starts_with` values only if enums exist
  (usually N/A); `between_dates` / `is_null` skip enum gate or validate
  date strings lightly (non-empty). Prefer fail closed on empty
  `between_dates` bounds.

### 6. MCP tool schema

- Extend Zod (or equivalent) filter union in `mcp-tools.ts` + description
  text listing new ops.

## Risks / Trade-offs

- **[Risk]** MySQL `MAX_EXECUTION_TIME` ignored on old servers → Mitigation:
  document; Postgres path is the primary enterprise target for schema+timeout.
- **[Risk]** Pool `max: 4` under parallel MCP tools queues → Mitigation:
  acceptable for stdio single-agent; revisit with HTTP transport.
- **[Risk]** `between_dates` vs `range` overlap → Mitigation: both allowed;
  docs steer agents to `between_dates` for calendar columns.
- **[Risk]** Schema identifiers with special characters → Mitigation: only
  accept identifiers matching a conservative pattern (letters, digits,
  underscore, and CJK) OR quote via `quoteIdent` after non-empty trim; never
  interpolate unquoted.

## Migration Plan

- Default `schema: public` preserves current behavior for existing configs.
- No DB migrations; operators add `schema:` when tables live elsewhere.
- Rollback: revert connector-sql / core parse; configs with only `schema`
  omitted remain valid.

## Open Questions

- None that block specs or tasks; `poolMax` config deferred intentionally.
