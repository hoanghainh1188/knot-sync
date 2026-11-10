# sql-source Specification

## Purpose

Connects KnotSync to PostgreSQL and MySQL as read-only, allow-listed data
sources so scan can inventory tables and later MCP tools can query only what
the customer explicitly exposes—without storing connection secrets in config.

## Requirements

### Requirement: connector-sql package

The system SHALL provide package `packages/connector-sql` published as
`@hoanghainh/knot-sync-connector-sql` that registers built-in connectors for
source types `postgres` and `mysql`. Runtime third-party dependencies SHALL be
limited to `pg` (MIT) and `mysql2` (MIT) plus workspace packages.

#### Scenario: Types listed in plugins

- **WHEN** the user runs `knot-sync plugins` with default plugins
- **THEN** output includes connector ids `postgres` and `mysql` (or equivalent
  registration visible through the connector registry)

### Requirement: Env-only connection URL

Each SQL source SHALL declare `url: env:NAME` (environment variable name). The
config loader / connector MUST resolve the URL from `process.env[NAME]` at
runtime. The config file MUST NOT contain a plaintext connection URL. If the
environment variable is missing or empty, loading or connecting SHALL fail with
an actionable message naming the variable.

#### Scenario: Missing env var

- **WHEN** a source has `url: env:KNOT_PG_URL` and that variable is unset
- **THEN** the command fails with a message that names `KNOT_PG_URL`

### Requirement: Read-only database session

When connecting, the connector SHALL use a read-only session or transaction
mode appropriate to the driver (for example PostgreSQL `default_transaction_read_only`
/ `SET TRANSACTION READ ONLY`, MySQL read-only transaction or equivalent). The
connector MUST NOT issue INSERT, UPDATE, DELETE, DDL, or other mutating
statements as part of scan or MCP query helpers.

#### Scenario: Scan does not mutate

- **WHEN** a SQL source is scanned
- **THEN** no table data or schema in the customer database is modified by KnotSync

### Requirement: Allow-list of tables and columns

Each SQL source SHALL include an `allow` map (or equivalent structure) listing
exposed tables and, for each table, the allowed column names. Scan and MCP
MUST ignore tables and columns not listed. An empty `allow` SHALL fail config
validation with an actionable message.

#### Scenario: Unlisted table invisible

- **GIVEN** `allow` lists only table `受注` with columns `受注番号` and `金額`
- **WHEN** introspection runs
- **THEN** other database tables are not included in the inventory or schema
  resources

### Requirement: Introspection for allowed objects

For each allowed table that exists, the connector SHALL introspect column
names, types, nullability, and primary/unique key information available from
the database catalogs. Missing allowed tables SHALL be reported as scan issues
without aborting the whole multi-source scan when possible.

#### Scenario: Japanese table name

- **GIVEN** an allowed table named `請求書`
- **WHEN** the source is scanned
- **THEN** that table appears in the inventory with its introspected columns

### Requirement: Scan inventory for SQL sources

`knot-sync scan` SHALL inventory each allowed table as a source entry (via the
connector `scan` contract) including a stable relative identity for the table,
document type suitable for DB rows, and a row-count estimate when the database
provides one (otherwise a documented sentinel such as 0 with an issue or note).
Scan MUST NOT persist customer row payloads into the store.

#### Scenario: Table count in scan output

- **GIVEN** a postgres source with three allowed existing tables
- **WHEN** the user runs `knot-sync scan`
- **THEN** the source’s reported file/table count is 3
- **AND** row estimates are reflected in size or an equivalent stats field per design

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

### Requirement: Enterprise SQL source types when plugin loaded

When the enterprise SQL connector plugin is loaded and licensed, config MAY
declare SQL sources with the documented enterprise `type` values (SQL Server,
Oracle, Access, IBM i / AS400). Those sources SHALL follow the same env-only
URL and non-empty `allow` rules as Postgres/MySQL. When the plugin is not
loaded, unknown enterprise `type` values SHALL fail config/plugin resolution
with an actionable message (same as any unknown connector type today).

#### Scenario: mssql source parses with env URL

- **GIVEN** the enterprise plugin is loaded
- **AND** a source has type SQL Server, `url: env:KNOT_MSSQL_URL`, and a
  non-empty `allow` including a Vietnamese table name such as `hoa_don`
- **WHEN** config is loaded successfully
- **THEN** the connector accepts the source and resolves the URL from the env
  var at connect time
