# Tasks

## 1. Package skeleton and license

- [x] 1.1 Create `packages/connector-sql-enterprise` (private, plugin default
      export, `apiVersion` compatible) with settings parser + license self-check
      — verify unknown settings keys fail; missing license blocks usable
      connectors; `knot-sync plugins` lists enterprise connectors only when
      `plugins:` includes the package
- [x] 1.2 Wire workspace/tsconfig references and README setup (license env,
      optionalDeps note) — verify package builds with `pnpm test` scope

## 2. Shared SQL driver integration

- [x] 2.1 Implement or reuse `SqlDriver` + scan/query path for enterprise types;
      extend quoting/dialects for mssql/oracle/access/as400 — verify unit tests
      with mock drivers (JP/VN identifiers)
- [x] 2.2 Ensure MCP `describe_table` / `query_table` resolve enterprise source
      types without free-form SQL — verify mocked query_table equals filter on
      allow-listed column; disallowed column rejected

## 3. Engine adapters

- [x] 3.1 SQL Server (`mssql`) via `tedious` (or documented MIT pure-JS driver) +
      read-only intent — verify mock/integration tests; list dep + license in
      package.json
- [x] 3.2 Oracle (`oracle`) via approved driver and/or ODBC fallback; soft-fail
      missing client — verify unit tests with injected factory
- [x] 3.3 Access (`access`) via ODBC; soft-fail missing ACE/Jet — verify unit
      tests with injected factory
- [x] 3.4 IBM i / AS400 (`as400`) via ODBC; soft-fail missing IBM client —
      verify unit tests with injected factory

## 4. Docs and roadmap

- [x] 4.1 Update starter comments / README / Paid #3 in `docs/ROADMAP.md`;
      document env URL examples for all four types; run full `pnpm test`
      (mocks only; no live enterprise DBs in CI)

## Workflow follow-up

- Archive with `/opsx:archive add-enterprise-sql-connectors` after apply review
- Commit / PR when Harry asks
