# enterprise-sql Specification

## Purpose

Provides opt-in, licensed connectors for SQL Server, Oracle, Access, and IBM i
(AS400) so KnotSync can inventory and query allow-listed tables with the same
read-only, env-URL, no-free-SQL discipline as Postgres/MySQL—without embedding
secrets in config or writing to customer databases.

## Requirements

### Requirement: Opt-in enterprise SQL connector plugin

The system SHALL provide a connector plugin (not loaded as a default built-in)
that operators enable by listing it under config `plugins:`. When loaded and
licensed, it SHALL register source types for SQL Server, Oracle, Access, and
IBM i / AS400 (documented `type` strings). Connection URLs SHALL use `url:
env:NAME` only. Each source SHALL require a non-empty `allow` map of tables and
columns.

#### Scenario: Japanese SQL Server table in allow-list

- **GIVEN** the enterprise SQL plugin is listed with a valid license
- **AND** a source `type` for SQL Server with `url: env:KNOT_MSSQL_URL` and
  `allow` listing table `請求` with column `金額`
- **AND** the env URL points at a reachable read-capable server
- **WHEN** `knot-sync scan` runs
- **THEN** the inventory includes that table identity
- **AND** no customer table data is modified

#### Scenario: Plugin omitted keeps only free SQL types

- **GIVEN** config does not list the enterprise SQL plugin
- **WHEN** the user runs `knot-sync plugins`
- **THEN** connector ids for the four enterprise engines are not registered
- **AND** `postgres` / `mysql` still load as today

### Requirement: License self-check

The enterprise SQL plugin SHALL validate its own license (environment variable
and/or plugin settings) before registering connectors or opening connections.
The KnotSync core SHALL NOT implement that check. Invalid or missing license
SHALL fail load or connection with guidance to set the documented license
env/key.

#### Scenario: Missing license blocks enterprise connectors

- **GIVEN** the plugin path is listed but no valid license is configured
- **WHEN** plugins load or an enterprise source would connect
- **THEN** enterprise connectors are not usable
- **AND** the message names how to set the license

### Requirement: Read-only and parameterized access only

Enterprise connectors SHALL use the strongest practical read-only session mode
for each engine and MUST NOT issue mutating SQL from scan or MCP helpers.
`query_table` / `describe_table` SHALL use parameterized queries and
allow-listed identifiers only—no free-form SQL input.

#### Scenario: Disallowed column rejected

- **GIVEN** an allow-listed Oracle table without column `SALARY`
- **WHEN** `query_table` requests a filter on `SALARY`
- **THEN** the tool rejects the request without running free SQL

### Requirement: Driver and ODBC soft-fail

When a required Node driver module or system ODBC/vendor client is missing, the
connector SHALL soft-fail (or fail that source) with an actionable message
naming the missing dependency and pointing to setup docs—without aborting
unrelated folder/Postgres/MySQL sources in a multi-source scan when possible.

#### Scenario: Missing Access ODBC driver

- **GIVEN** an Access source is configured and licensed
- **AND** the host ODBC Access/ACE driver is unavailable
- **WHEN** scan or query runs for that source
- **THEN** the operator sees a message to install/configure the documented ODBC
  driver
- **AND** other sources can still proceed
