# Spec Delta

## ADDED Requirements

### Requirement: Configurable PostgreSQL schema

Each `postgres` source MAY declare `schema` as a non-empty identifier string.
When omitted, the effective schema SHALL be `public`. Introspection (columns,
keys, row estimates) and qualified table references for that source MUST use
the configured schema only. Empty or whitespace-only `schema` SHALL fail
config load with an actionable error. MySQL sources SHALL continue to use the
connection database (`DATABASE()`) and MUST reject a `schema` key if present.

#### Scenario: Japanese business schema

- **GIVEN** a postgres source with `schema: 経理` and allow-list table `請求`
- **WHEN** the source is scanned
- **THEN** introspection looks up `請求` in schema `経理` (not `public`)
- **AND** a matching table in `経理` appears in the inventory

#### Scenario: Default public schema

- **GIVEN** a postgres source with no `schema` key
- **WHEN** introspection runs
- **THEN** tables are resolved under schema `public`

#### Scenario: Reject empty schema

- **WHEN** config sets `schema: ""` on a postgres source
- **THEN** config load fails with a message that `schema` must be non-empty

#### Scenario: MySQL rejects schema key

- **WHEN** a mysql source includes `schema: anything`
- **THEN** config load fails with an actionable message that `schema` is
  postgres-only

### Requirement: Pooled SQL connections with a max size

SQL drivers for scan and MCP query helpers SHALL use a connection pool with a
documented maximum size (not an unbounded single long-lived client per
operation without a pool). Pool size MUST be capped (documented default).
Connections obtained from the pool MUST still run in read-only mode before
customer queries. Closing the driver SHALL release the pool.

#### Scenario: Scan uses a pooled connection

- **GIVEN** a configured postgres or mysql source
- **WHEN** `knot-sync scan` inventories allow-listed tables
- **THEN** the driver obtains a connection from a capped pool
- **AND** the session is read-only before introspection queries run

### Requirement: Statement timeout on SQL sessions

Each pooled connection used for introspection or `query_table` SHALL enforce a
server-side statement / max-execution time bound with a documented default
(e.g. 5000 milliseconds). When a statement exceeds the bound, the operation
SHALL fail with an actionable error and MUST NOT leave the customer database
mutated. Operators MAY override the timeout via a documented source-level or
shared config key if provided in this change; otherwise the default applies.

#### Scenario: Slow query is aborted

- **GIVEN** a statement that would run longer than the configured timeout
- **WHEN** introspection or `query_table` executes that statement
- **THEN** the client receives a timeout/cancel error with an actionable message
- **AND** no INSERT/UPDATE/DELETE/DDL was issued by KnotSync
