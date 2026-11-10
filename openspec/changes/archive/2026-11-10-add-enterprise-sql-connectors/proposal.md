# Proposal

## Why

Free KnotSync only speaks **Postgres and MySQL**. JP/VN enterprises still run
**SQL Server, Oracle, Access, and IBM i (AS400)**. Paid roadmap item **SQL
engines** extends the same read-only, allow-listed, env-URL discipline to those
systems so `scan` / `describe` / MCP `describe_table` & `query_table` work
without free-form SQL.

## What Changes

- Add an **opt-in paid connector plugin** package (private workspace) that
  registers source types for **SQL Server (`mssql`)**, **Oracle (`oracle`)**,
  **Access (`access`)**, and **IBM i / AS400 (`as400`)**
- Reuse the existing SQL contracts: `url: env:NAME`, non-empty `allow` map,
  read-only session intent, parameterized `query_table` / `describe_table` (no
  free SQL), untrusted cell framing
- Plugin **self-checks** a license key; core never validates licenses; **not**
  loaded as a free CLI built-in
- Document per-engine driver/runtime needs (pure JS where possible; ODBC or
  optional native client libraries where required). Free published CLI stays
  free of native deps; enterprise package may declare optional/native/ODBC deps
- Soft-fail missing drivers / ODBC / license with actionable messages
- Update README / Paid #3 row in `docs/ROADMAP.md`

**Assumptions (from Harry):**

- This change covers **all four** engines in one OpenSpec change (tasks may
  land engine-by-engine but the capability ships together)
- “Support all” means prefer pure-JS drivers when viable, and allow
  **ODBC / optional native** for engines that need them—not a Docker-sidecar-only
  design

## Capabilities

### New Capabilities

- `enterprise-sql`: paid connectors for mssql / oracle / access / as400 with
  license gate, driver/ODBC setup docs, and the same allow-list + read-only
  guarantees as free SQL sources

### Modified Capabilities

- `sql-source`: extend inventory/scan expectations to the new source `type`
  values when the enterprise plugin is loaded (free types unchanged)
- `sql-query`: MCP describe/query tools MUST resolve the new types through the
  connector/driver registry with dialect-safe quoting and parameterized filters
- `plugin-system`: document enterprise SQL as opt-in paid connectors (not
  default built-ins)
- `config` (light): starter/docs for `plugins:` + `connector-sql-enterprise:`
  (or final plugin settings key) and example source `type` values

## Impact

- Code: new `packages/connector-sql-enterprise` (name TBD to npm convention);
  likely small shared hooks into `connector-sql` quoting/query-build or
  duplicated dialect modules behind the same `SqlDriver` shape; CLI loads only
  via `plugins:`
- Ops: operators install system ODBC / vendor clients for Oracle, Access, AS400
  as documented; SQL Server targets pure-JS `tedious` (MIT) by default
- Dependencies (licenses to pin at design/apply): e.g. `tedious` (MIT),
  `odbc` (MIT) and/or vendor-approved Node drivers (`oracledb` Apache-2.0/UPL,
  etc.)—**only MIT/BSD/Apache/ISC** (and UPL if treated as Apache-compatible)
  listed in proposal/design; no GPL/AGPL
- Product: free core/publish path unchanged; still read-only to customer DBs;
  no telemetry

## Out of scope

- Making enterprise engines default built-ins of the free CLI
- Free-form SQL / write tools / stored-procedure execution
- Migrating Postgres/MySQL out of the free built-in package
- OAuth, OCR, housen, vector search, local LLM catalog
- Guaranteeing every OS/vendor ODBC stack works without documented setup
- Shipping proprietary IBM/Microsoft ODBC installers inside the npm tarball
