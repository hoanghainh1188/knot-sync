# Design

## Context

See proposal.md — Why. Free `packages/connector-sql` registers built-in
`postgres` / `mysql` connectors implementing `SqlDriver` (introspect +
parameterized query + read-only enable). MCP tools live in the same package and
dispatch by source type. `findExtractor`-style first-match does not apply;
connectors are keyed by `type`. Paid OCR/housen established: private package,
license self-check, opt-in `plugins:`.

Hard tension: open-core says **no native deps** on the published free CLI.
Enterprise DBs often need ODBC/native clients. Resolution: keep free CLI pure;
put optional/native/ODBC deps only on the paid private package that is never
bundled into the free npm publish.

## Goals / Non-Goals

**Goals:**

- Four opt-in types: `mssql`, `oracle`, `access`, `as400`
- Same safety model as free SQL (env URL, allow-list, no free SQL, read-only intent)
- License self-check; soft-fail missing drivers/ODBC
- Tests with mocked drivers (no live SQL Server/Oracle/Access/AS400 in CI)

**Non-Goals:**

- Shipping vendor ODBC installers
- Docker-only DB proxy as the sole path (optional later if needed)
- Changing Postgres/MySQL built-in behavior

## Decisions

### 1. Package layout

**Choice:** `packages/connector-sql-enterprise`, npm
`@hoanghainh/knot-sync-connector-sql-enterprise`, `"private": true`. Plugin name
`connector-sql-enterprise`; settings key `connector-sql-enterprise:`.

**Alternatives:** Four packages — more publish/license churn; rejected for v1.
Patch free `connector-sql` — rejected (forces deps into free path).

### 2. Shared SQL surface

**Choice:** Depend on workspace `@hoanghainh/knot-sync-connector-sql` **or**
extract a thin shared module if needed for `SqlDriver`, quoting, and
`buildSelectQuery`. Prefer implementing enterprise drivers against the existing
`SqlDriver` interface and registering connectors that call shared `scanSql` /
MCP dispatch. If MCP tools are registered only by the free plugin and hard-code
`postgres|mysql`, **extend** them (or register parallel tool handlers) so
enterprise source ids resolve—favor extending free MCP tool source resolution
to “any registered SQL connector implementing the driver contract” without
pulling enterprise deps into the free package (interface-only / duck typing).

**Alternatives:** Duplicate MCP tools in enterprise package — risk of duplicate
tool ids; only if free tools cannot be generalized cleanly.

### 3. Per-engine drivers

| Type | Default approach | License notes |
| --- | --- | --- |
| `mssql` | `tedious` (pure JS) | MIT |
| `oracle` | `oracledb` (Thin mode preferred) or ODBC fallback | Apache-2.0 / UPL — confirm at apply |
| `access` | `odbc` + Microsoft ACE/Jet system driver | `odbc` MIT; ACE is OS install |
| `as400` | `odbc` + IBM i Access ODBC | `odbc` MIT; IBM client is OS install |

Exact package versions pinned at apply. OptionalDependencies so hosts without
Oracle/ODBC can still install the package for mssql-only use.

### 4. Identifier quoting

**Choice:** Extend dialect enum: `mssql` → `[brackets]`, `oracle`/`as400` →
quoted identifiers per dialect docs, `access` → `[brackets]` or ODBC-quoted.
JP/VN names must round-trip in fixtures/mocks.

### 5. License

**Choice:** `KNOT_SYNC_SQL_ENTERPRISE_LICENSE` / settings `licenseKey`; test
sentinel `knot-sync-sql-enterprise-dev`. Fail register or first connect with
`LICENSE` guidance.

### 6. Read-only

**Choice:** Best-effort per engine (`ApplicationIntent=ReadOnly` / SET
TRANSACTION READ ONLY / ODBC connection attributes where available). Still
never emit mutating SQL from our builders. Document engines where the server
may ignore read-only hints.

## Risks / Trade-offs

- **[Native/ODBC on developer machines]** → optionalDeps + clear setup docs;
  CI mocks factories
- **[MCP tool duplication / hard-coded dialects]** → must generalize resolution
  in apply tasks
- **[Access/AS400 platform skew]** → Windows/IBM client docs; soft-fail
- **[Scope size]** → tasks ordered mssql → oracle → access → as400; shared
  skeleton first

## Migration Plan

- No store schema change
- Existing installs unchanged until `plugins:` lists enterprise package
- Rollback: remove plugin entry

## Open Questions

None blocking propose—exact npm versions and whether MCP lives only in free
`connector-sql` vs shared helper are fixed at apply against current code.
