# Proposal

## Why

Folder sources cover office files, but Japanese and Vietnamese enterprises keep
critical data in PostgreSQL and MySQL. Agents need a read-only, allow-listed
path into those databases—without free SQL, without storing connection secrets
in config, and without write access—before the Semantic Catalog can annotate
cryptic columns.

## What Changes

- New package `packages/connector-sql` (`@hoanghainh/knot-sync-connector-sql`):
  built-in connector plugin(s) registering source types `postgres` and `mysql`.
- Connection URL from an environment variable only (`url: env:NAME` in config);
  the resolved URL MUST NOT be written into the config file or the audit log
  body in full (redact credentials).
- Connect **read-only** (read-only transaction / session settings appropriate to
  each driver). Introspect tables, columns, types, and keys for tables listed
  under source `allow:`.
- `allow:` lists which tables (and which columns per table) are exposed; anything
  not listed is invisible to scan and MCP.
- `scan` for SQL sources reports table counts and row estimates (inventory
  suitable for health reporting; no customer row payloads stored from scan).
- MCP: resource `knot://db/{source}/{table}/schema`; tools `describe_table` and
  `query_table` with filters on allowed columns only (equals, in, range,
  contains), parameterized queries, max rows, **no free SQL**.
- Results that include cell values SHALL use the same untrusted-content framing
  as document tools.
- New third-party dependencies (both MIT): `pg`, `mysql2`.

### Out of scope

- SQL Server / Oracle / Access / AS400 (paid edition).
- Semantic Catalog labels / enum validation on query params (`add-semantic-catalog`).
- Write queries, DDL, stored procedures, or any mutating SQL.
- Connection pooling UI, migrations, or embedding a database server.
- Free-form SQL tool for agents.
- OCR or non-SQL sources.

## Capabilities

### New Capabilities

- `sql-source`: postgres/mysql connectors, env-based URLs, allow-list
  introspection, read-only scan inventory (table counts / row estimates).
- `sql-query`: MCP schema resource plus `describe_table` / `query_table` with
  parameterized, allow-listed filters and untrusted framing.

### Modified Capabilities

- `plugin-system`: SQL connectors register as `postgres` / `mysql`; core
  `SourceConfig` widens so non-fs sources parse through the connector registry.
- `mcp-server`: expose SQL schema resource and `describe_table` / `query_table`
  tools (with audit and untrusted framing).
- `scan-report`: SQL sources participate in `scan` inventory/health via the
  connector scan contract (table entries / row estimates).

## Impact

- **Code:** `connector-sql`; widen `SourceConfig`; CLI scan path for SQL;
  MCP server resources/tools; tests with mocked drivers or local ephemeral DBs
  built in fixtures (no committed credentials).
- **Deps:** `pg` (MIT), `mysql2` (MIT).
- **Docs:** README SQL source example, ROADMAP mark done when archived.
