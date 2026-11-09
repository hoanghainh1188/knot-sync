# Tasks

## 1. Config: schema and statement timeout

- [x] 1.1 Extend `SqlSourceConfig` with optional `schema` (postgres) and
      optional `statementTimeoutMs` (default 5000); parse/validate in
      `packages/connector-sql` `parse.ts` (and core types as needed) —
      verify unit tests: default `public`, Japanese schema `経理`, reject
      empty schema, reject `schema` on mysql, reject non-positive timeout
- [x] 1.2 Thread `schema` / `statementTimeoutMs` into driver factory /
      scan / schema helpers — verify a loadConfig or parse fixture returns
      them on a postgres source

## 2. Pooled drivers + schema-aware introspection

- [x] 2.1 Switch Postgres driver to `pg.Pool` (max default 4), set
      read-only + `statement_timeout` on checkout, bind configured schema
      in introspection and schema-qualify table references — verify tests
      (mocked client/pool or query spy) that schema `経理` is used and
      timeout SET runs; `close()` ends the pool
- [x] 2.2 Switch MySQL driver to `mysql2` pool with the same max default,
      read-only transaction, and `MAX_EXECUTION_TIME` / equivalent —
      verify unit tests for pool close and timeout session setup
- [x] 2.3 Keep scan + describe_table working under the new drivers —
      verify existing connector-sql scan/schema tests still pass
      (`pnpm test` scoped or full package)

## 3. query_table filter operators

- [x] 3.1 Add `starts_with`, `between_dates`, and `is_null` to
      `QueryFilter` / `buildSelectQuery` with parameterized SQL and LIKE
      escaping — verify unit tests for Vietnamese prefix `Nguyễn`,
      Japanese date column bounds, and is_null true/false
- [x] 3.2 Wire new ops into MCP `query_table` input schema/description
      and catalog resolve path — verify tool schema lists the ops and a
      handler test rejects disallowed columns for the new ops

## 4. Docs and full verification

- [x] 4.1 Document `schema`, `statementTimeoutMs`, pool/timeout defaults,
      and new filter ops in connector-sql / root README; mark
      `harden-sql-connector` done in `docs/ROADMAP.md` — verify README
      mentions `schema` and the three filter ops
- [x] 4.2 Run `pnpm test` and confirm all suites pass

## Workflow follow-up

- Archive with `/opsx:archive` after review/merge.
- Continue v0.3 with `add-http-mcp-transport` when ready.
