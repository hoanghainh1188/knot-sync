# Tasks

## 1. Config Schema & System Log Fields (`packages/core`)

- [x] 1.1 Add `syncIntervalSeconds?: number` to `ServerConfig` in `packages/core/src/types.ts`, allow `"sync_interval_seconds"` in `SERVER_KEYS` and `parseServerConfig` (validated via `assertPositiveNumber`, omitting by default) and document `#   # sync_interval_seconds: 300` in `SAMPLE_CONFIG` in `packages/core/src/config.ts`, verifying `tsc -b` compiles cleanly.
- [x] 1.2 Extend `SystemLogRecord` and `SystemLogger.append` in `packages/core/src/system-log.ts` with optional numeric summary fields (`scanned`, `extracted`, `skipped`, `pruned`, `failed`) while keeping `content` excluded, verifying `tsc -b` compiles cleanly.
- [x] 1.3 Add `node:test` unit tests in `packages/core/src/core.test.ts` verifying omitted `server.sync_interval_seconds` stays `undefined`, valid positive intervals parse into `server.syncIntervalSeconds`, invalid/non-positive/unknown `server` keys fail with `ConfigError`, and `SystemLogger` persists sync summary counters without sensitive fields.

## 2. Reusable In-Process Sync Pipeline & Scheduler (`packages/cli`)

- [x] 2.1 Extract shared in-process `runScanPass`, `runSyncPass`, and a sequential non-overlapping periodic scheduler helper (`startPeriodicSync`) in `packages/cli/src/sync-cycle.ts` reusing the caller's open `Store`, yielding between items via `setImmediate`, respecting shutdown `AbortSignal`, soft-failing cycle errors cleanly, and running optional `embed_documents` (`onRun: true`) without writing to `stdout`; refactor `cmdScan` and `cmdRun` in `packages/cli/src/main.ts` to share these helpers with unchanged standalone CLI output.
- [x] 2.2 Add `node:test` unit tests (e.g. `packages/cli/src/sync-cycle.test.ts` or in `packages/cli/src/cli.test.ts`) verifying non-overlapping sequential scheduling (slow cycle never triggers concurrent cycle), abort/drain completion before cleanup, and clean soft-failure continuation with mocked/failing sources.

## 3. `knot-sync serve --sync-interval` Integration & Localization (`packages/cli`)

- [x] 3.1 Add `--sync-interval <seconds>` option parsing in `packages/cli/src/main.ts`, resolve effective interval (`cliFlag ?? config.server.syncIntervalSeconds`), validate positive finite numbers, wire `startPeriodicSync` into `cmdServe` for both `--http` and stdio modes, emit `sync.start` / `sync.end` / `sync.error` records to `system.jsonl`, and drain any active sync cycle before `store.close()` on exit.
- [x] 3.2 Add localized help and error messages (`serve.invalidSyncInterval`, updated `help`, optional listen notice) across `packages/cli/src/i18n/messages.ts`, `en.ts`, `ja.ts`, and `vi.ts`, verifying `--help --lang ja` and `--lang vi` remain clean and accurate.
- [x] 3.3 Add `node:test` end-to-end tests in `packages/cli/src/cli.test.ts` verifying invalid `--sync-interval` rejection in localized output, live HTTP MCP serving with background periodic sync detecting newly added Vietnamese/Japanese files and pruning removed files while handling concurrent MCP `search_documents` requests cleanly, and `system.jsonl` recording `sync.start`/`sync.end`/`sync.error` without document bodies or PII.

## 4. Documentation & Full Verification

- [x] 4.1 Document `server.sync_interval_seconds` and `knot-sync serve --sync-interval <seconds>` in `README.md` and `packages/cli/README.md`, and update `add-periodic-sync` status to `✅ done` in `docs/ROADMAP.md`.
- [x] 4.2 Run full workspace build and `node:test` suite (`pnpm build && pnpm test`) and verify every test passes with zero failures.

## Workflow follow-up

- After implementation and verification complete, run `/opsx-archive` to archive `add-periodic-sync` and sync the delta specs into `openspec/specs/`.
