# Design

## Context

Today `knot-sync scan` and `knot-sync run` run as one-shot CLI invocations opening and closing `Store`, while `knot-sync serve` opens `Store` once and serves MCP requests over `stdio` or Streamable HTTP (`/mcp`) until interrupted. See `proposal.md` for why shared LAN and long-lived deployments need optional built-in periodic sync inside `serve`.

## Goals / Non-Goals

**Goals:**
- Support optional `server.sync_interval_seconds` in YAML config and `--sync-interval <seconds>` on `knot-sync serve` (flag overrides config; disabled by default).
- Execute incremental `scan` + `run` (extract, JA/VN clean, PII mask/hash/drop, guard, optional `embed_documents` hook) + stale-document pruning in-process without blocking or interrupting active MCP requests.
- Guarantee clean shutdown ordering so timers cancel and any in-flight sync cycle drains safely before `store.close()`.
- Log cycle start, completion summary counters (`sync.end`), and transient cycle errors (`sync.error`) to `system.jsonl`.

**Non-Goals:**
- Spawning background child OS processes or external daemons.
- OS-level filesystem event watchers (`fs.watch`), multi-node lock coordination, or auto-running `knot-sync describe`.
- Changing `audit_log` format or adding MCP write/admin tools.

## Decisions

### 1. Positive interval validation and flag precedence
- **`packages/core` (`ServerConfig` & `parseServerConfig`)**:
  - Add `"sync_interval_seconds"` to `SERVER_KEYS` and `syncIntervalSeconds?: number` to `ServerConfig`.
  - Reuse `assertPositiveNumber(obj.sync_interval_seconds, "server.sync_interval_seconds")` when present so behavior matches `extraction.timeoutSeconds` and `scan.old_file_years` (accepts positive finite numbers, rejects `0`, negative numbers, `NaN`, strings, and booleans with `ConfigError`).
- **`packages/cli` (`--sync-interval <seconds>`)**:
  - Parse `--sync-interval` as a string option in `main.ts`. Only applies to `serve`; when provided, parse via `Number(value)` and require `Number.isFinite(n) && n > 0`, failing fast with localized `ConfigError` (`serve.invalidSyncInterval` in `en`/`ja`/`vi`) if invalid.
  - Precedence: `cliFlag ?? config.server.syncIntervalSeconds`. When undefined, `serve` behaves identically to today with zero background timers.

### 2. In-process pipeline extraction reusing the active `Store`
- Extract reusable pipeline helpers (`packages/cli/src/sync-cycle.ts` or similar) shared by `cmdScan`, `cmdRun`, and `serve`:
  - **`runScanPass`**: scans every configured source, invokes `store.replaceScan(source.id, files, issues)`, and yields periodically to the event loop (`setImmediate` / microtask boundary) when walking large directories so pending HTTP/stdio callbacks execute promptly.
  - **`runSyncPass`**: iterates `store.listFiles()`, skips unchanged files via `store.isUnchangedExtraction(file)`, extracts/cleans/masks/guards only new or modified files, flushes chunks via `store.upsertDocuments`, calls `store.pruneStaleDocuments(...)`, and invokes `embed_documents` (`onRun: true`) if loaded—returning numeric summary counts (`scanned`, `extracted`, `skipped`, `pruned`, `failed`).
- **Alternative considered**: Spawning `node knot-sync scan && node knot-sync run` as a child process from `serve`. Rejected because opening a second writable SQLite connection under concurrent MCP reads/writes risks `SQLITE_BUSY` contention and slows startup with repeated plugin loading; sharing the already-open `Store` inside `cmdServe` avoids cross-process SQLite lock contention, skips duplicate plugin initialization, and simplifies cancellation.

### 3. Non-overlapping scheduler, event-loop responsiveness, and safe shutdown
- Schedule sequential `setTimeout` ticks (delay = `intervalMs`) using a tiny reusable scheduler helper:
  - Wait one `intervalMs` after `serve` starts listening before triggering the first background cycle so startup latency stays zero.
  - Re-arm the next `setTimeout` **only after** the current cycle finishes (`finally`), preventing overlapping sync cycles even when a cycle takes longer than `intervalSeconds`.
  - Call `.unref()` if needed on idle wait timers? Even better, explicitly maintain `stopped`, `AbortController`, `timer`, and `activeCycle: Promise<void> | null`: on server close (`serveHttp` or `serveStdio` completing in `cmdServe`'s `finally`), set `stopped = true`, `clearTimeout(timer)`, trigger `abortController.abort()` so an in-flight cycle aborts cleanly between files (never mid-transaction), and `await activeCycle` before `store.close()`.
  - Inside sync loops, check `signal.aborted` and yield briefly (`new Promise((resolve) => setImmediate(resolve))`) between files so active MCP `search_documents` / `get_document` / `query_table` requests are never starved by synchronous cleaning or PII regexes.

### 4. Stdout safety and `system.jsonl` observability
- **Stdio MCP isolation**: `runSyncCycle` inside `serve` never writes to `io.out` (`stdout`), keeping MCP JSON-RPC framing clean in stdio mode. Startup banner on `io.err` (`stderr`) optionally appends sync interval info; system log write errors continue to report only to `io.err`.
- **`SystemLogRecord` (`packages/core/src/system-log.ts`)**:
  - Extend `SystemLogRecord` with optional numeric summary fields (`scanned`, `extracted`, `skipped`, `pruned`, `failed`), keeping the strict ban on document bodies, titles, PII, or secrets.
  - Emit `sync.start` (`level: "info"`, `command: "serve"`, `storePath`) at cycle start, `sync.end` (`level: "info"`, `command: "serve"`, `durationMs`, `storePath`, `scanned`, `extracted`, `skipped`, `pruned`, `failed`) on success, and `sync.error` (`level: "error"`, `command: "serve"`, `durationMs`, `storePath`, `error: sanitizeSystemLogError(err)`) if the cycle throws—catching all cycle errors so MCP serving continues uninterrupted.

### 5. Read-only & fully-local guarantees
- Customer folders and source SQL databases are accessed exclusively through existing read-only `connector.scan` and `extractor.extract` methods (zero writes, moves, or deletes on customer data).
- All scheduling timers, extraction, cleaning, PII masking, injection guardrails, SQLite storage, and `system.jsonl` logging execute locally in-process with zero outbound network calls or telemetry and zero new third-party dependencies.

## Risks / Trade-offs

- **SQLite write lock latency during large `upsertDocuments` chunks** → Reuse the existing `DEFAULT_UPSERT_CHUNK` transaction boundaries and yield via `setImmediate` between files and scan batches so MCP read queries interleave smoothly within milliseconds.
- **Transient source unavailability during background sync (e.g., temporary NAS hiccup)** → Catch cycle-level errors cleanly inside the scheduler, log sanitized `sync.error` to `system.jsonl`, keep the MCP server running, and retry on the next interval tick.
- **Shutdown while a slow extraction is mid-flight** → Propagate shutdown `AbortSignal` into the sync loop and await the in-flight pass before `store.close()`, ensuring clean exit without partial transactions or post-close DB errors.
