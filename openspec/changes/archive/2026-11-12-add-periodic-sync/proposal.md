# Proposal

## Why

Shared LAN deployments running `knot-sync serve --http` (and long-lived workstation `serve` processes) currently serve a static snapshot of `store.sqlite` until an operator manually runs external cron jobs for `knot-sync scan` and `knot-sync run`. Adding an optional built-in periodic sync interval lets `knot-sync serve` keep documents fresh automatically—running incremental `scan`, extract/clean/PII/guard `run`, and stale-document pruning—without external schedulers or interrupting active MCP requests.

## What Changes

- **Config option (`packages/core`):**
  - Extend `ServerConfig`, `SERVER_KEYS`, `parseServerConfig`, and `SAMPLE_CONFIG` to accept optional `server.sync_interval_seconds` (positive finite number, omitted/disabled by default). Reject unknown keys or non-positive/non-numeric values with `ConfigError`.
  - Extend `SystemLogRecord` and `SystemLogger.append` in `packages/core/src/system-log.ts` with optional non-sensitive periodic-sync numeric summary fields (`scanned`, `extracted`, `skipped`, `pruned`, `failed`).
- **CLI flag & background sync scheduler (`packages/cli`):**
  - Add `--sync-interval <seconds>` option to `knot-sync serve` (works for both `--http` and stdio transports). `--sync-interval` overrides `server.sync_interval_seconds` when specified, and invalid values fail startup with a localized `ConfigError` (`en`/`ja`/`vi`).
  - Extract reusable, in-process incremental `scan` + `run` + prune pipeline helpers that share the active `Store` instance, yield to the Node.js event loop between files/batches so active MCP tool/resource requests continue without interruption, prevent overlapping cycles (wait one interval after completion), and never write sync diagnostics to `stdout`.
  - Soft-fail transient sync cycle errors (log to `system.jsonl` and keep serving MCP) and cancel pending timers cleanly on server shutdown (`SIGINT` / `SIGTERM` / close).
  - Log each background sync cycle (`sync.start`, `sync.end` with counts/duration, or `sync.error`) to local `system.jsonl` without document content or PII.

**Out of scope**

- Modifying or writing to customer source directories or source SQL databases (sources remain 100% read-only; no MCP write tools before v1.0).
- Periodic auto-`describe` for SQL Semantic Catalog schemas or pushing changes to external webhooks/schedulers.
- File-system native OS watchers (`fs.watch` / `chokidar`) or distributed multi-process leader election (single-process interval scheduling only).
- Paid-edition plugins (`extractor-ocr`, `extractor-housen`, `connector-sql-enterprise`, `auth-oauth`, `catalog-llm`, `search-vector`, `guard-llm`) beyond invoking an already-loaded `embed_documents` hook on changed docs just as `knot-sync run` does today.
- New third-party dependencies (none; 0 new third-party dependencies, using Node.js built-in timers and existing workspace packages under Apache-2.0).

## Capabilities

### Modified Capabilities

- `config`: Allow optional positive `server.sync_interval_seconds` under `Optional server section` alongside `audit_log`.
- `mcp-server`: Extend `serve CLI command` for `--sync-interval <seconds>` and add `Background periodic sync` lifecycle behavior while keeping stdio/HTTP MCP responses uninterrupted and strictly framed.
- `system-logs`: Add operational `sync.start`, `sync.end`, and `sync.error` cycle events (summary counts/duration only, never document bodies or PII).

## Impact

- Code: `packages/core/src/types.ts`, `packages/core/src/config.ts`, `packages/core/src/system-log.ts`, `packages/cli/src/main.ts`, `packages/cli/src/i18n/{messages,en,ja,vi}.ts`, plus a dedicated sync helper module under `packages/cli/src/`.
- Tests: `packages/core/src/core.test.ts`, `packages/cli/src/cli.test.ts`.
- Docs: `README.md`, `packages/cli/README.md`, `docs/ROADMAP.md`.
- Dependencies: None (0 new third-party dependencies).
- Runtime safety: Strictly read-only on customer sources and fully local; no outbound network calls or telemetry.
