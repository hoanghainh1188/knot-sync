# Tasks

## 1. Core types and connector-sql package

- [x] 1.1 Widen `SourceConfig` with `SqlSourceConfig` (`postgres` | `mysql`, `url`, `urlEnv`, `allow`); keep `fs` working; verify with `pnpm test`
- [x] 1.2 Create `packages/connector-sql` (`@hoanghainh/knot-sync-connector-sql`) with workspace wiring; add deps `pg` (MIT) and `mysql2` (MIT) only as listed in the proposal
- [x] 1.3 Implement `url: env:NAME` parsing, allow-list validation, identifier quoting (JP/VN names); verify with `pnpm test`
- [x] 1.4 Implement read-only connect + introspection + scan→`FileEntry` mapping (row estimates) for postgres and mysql (mockable driver layer); verify with `pnpm test`

## 2. CLI scan + MCP query tools

- [x] 2.1 Register SQL connector plugin as a CLI built-in; ensure `scan` / `--json` include SQL sources; verify with `pnpm test`
- [x] 2.2 Implement `describe_table`, `query_table` (parameterized filters: eq/in/range/contains, limit cap), schema resource helpers, untrusted framing; register as `mcp-tool`s; verify with `pnpm test`
- [x] 2.3 Wire MCP server to SQL schema resource `knot://db/{source}/{table}/schema` and tools; audit without secrets; verify with `pnpm test`

## 3. Docs and final check

- [x] 3.1 Update README.md (SQL source example, env URL, allow-list, MCP tools) and mark `add-sql-source` done in `docs/ROADMAP.md`
- [x] 3.2 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-sql-source` after review.
