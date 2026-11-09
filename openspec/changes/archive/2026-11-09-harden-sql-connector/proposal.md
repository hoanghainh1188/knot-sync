# Proposal

## Why

Production Postgres deployments often put business tables outside `public`
(e.g. `経理`, `erp`). The SQL connector hard-codes `public` and opens a single
`pg.Client` / MySQL connection with no statement timeout, so introspection
misses real schemas and a runaway `query_table` can exhaust the customer DB.
This is the next v0.3 P1 hardening item after office extraction.

## What Changes

- Add optional `schema` on postgres sources (default **`public`**); introspection
  and qualified table references use that schema. Reject empty/invalid schema
  names with an actionable config error.
- Replace single-client Postgres/MySQL drivers with capped connection pools
  (`pg.Pool` / `mysql2` pool) while keeping every session read-only.
- Set a per-session / per-connection **`statement_timeout`** (Postgres) and
  equivalent MySQL max-execution bound (documented default, e.g. **5000ms**)
  so full-table scans cannot hang forever.
- Extend `query_table` filters with **`starts_with`**, **`between_dates`**, and
  **`is_null`** (parameterized only; allow-listed columns only).
- Document config keys and filter ops; update tests, README, and roadmap status.

Out of scope:

- SQL Server / Oracle / Access / AS400 (paid).
- Free-form SQL, write tools, or relaxing the allow-list.
- Other v0.3 items: `add-http-mcp-transport`, `enhance-pii-guard`,
  `scale-sqlite-store`, system logs.
- Changing catalog resolution, MCP transport, or PII/guard rules.
- New third-party dependencies: **none** (`pg` and `mysql2` already provide
  pooling APIs).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `sql-source`: configurable Postgres schema; pooled connections; statement
  timeout / query time bounds; keep read-only and env-only URL rules.
- `sql-query`: new filter operators `starts_with`, `between_dates`, `is_null`
  on `query_table`.

## Impact

- `packages/core` (`SqlSourceConfig` / source parsing if schema lives there)
- `packages/connector-sql` (`postgres.ts`, `mysql.ts`, `driver.ts`, `parse.ts`,
  `query-build.ts`, `mcp-tools.ts`, `quote.ts` if schema-qualified FROM)
- Tests under connector-sql (+ any config fixtures); README / `docs/ROADMAP.md`
