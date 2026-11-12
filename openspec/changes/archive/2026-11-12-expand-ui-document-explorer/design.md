# Design: Expand UI with Document Explorer & Health

## Context

`knot-sync ui` currently launches a loopback-only HTTP server (`packages/ui/src/server.ts`) exposing `/api/health`, `GET /api/catalog`, and `PUT /api/catalog`, backed by a bundled Vite/React SPA (`packages/ui/src/client/`). All extracted documents, PII/guard findings, and `scan_issues` reside in SQLite (`@hoanghainh/knot-sync-store-sqlite`), while `runSyncPass` (`packages/cli/src/sync-cycle.ts`) previously kept extraction issues only in memory / `system.jsonl`. See `proposal.md` for motivation and scope.

## Goals / Non-Goals

**Goals:**
- Surface a read-only **Documents & Health** tab alongside **Catalog Review** inside `packages/ui`.
- Persist the latest `run` issues in SQLite (`run_issues`) alongside `scan_issues` so `knot-sync ui` displays both scan and extraction issues even after CLI runs finish.
- Project strictly sanitized document summaries (`title`, masked `snippet`, `piiSummary`, `guardRisk`, `guardSummary`) with zero exposure of `metadata.originalContent`, `metadata.originalTables`, or raw matched PII strings.
- Support `en` / `ja` / `vi` chrome localization, zero CDN assets, and loopback-only (`127.0.0.1`) binding.

**Non-Goals:**
- Any document edit, delete, re-extract, or raw file download action from the UI.
- Any network calls, remote telemetry, or authentication beyond loopback binding.

## Decisions

### 1. Persist `run_issues` in `@hoanghainh/knot-sync-store-sqlite`
- **Schema addition**: Add `CREATE TABLE IF NOT EXISTS run_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, recorded_at TEXT NOT NULL)` in `Store.init()`. Because `CREATE TABLE IF NOT EXISTS` is idempotent, existing v0.x SQLite stores upgrade automatically with zero manual migration.
- **Lifecycle**: `Store.replaceRunIssues(issues: RunIssueRecord[])` replaces `run_issues` in a transaction at the end of `runSyncPass` (`packages/cli/src/sync-cycle.ts`) whenever inventory existed (even if zero issues, clearing stale resolved issues from prior runs).
- **Why SQLite vs parsing `system.jsonl` in UI?** `system.jsonl` is append-only operational telemetry that mixes multiple commands (`serve`, `bench`, `scan`, `run`) and may be disabled (`logging.level`), whereas SQLite holds the authoritative current state of the store cleanly indexed for `Store.listRunIssues()` and `Store.listScanIssues()`.

### 2. Read-Only Store Query Projection & PII Safety
- **No `originalContent` or raw PII**: Add `Store.listDocumentSummaries(options)` (or server-side projection in `packages/ui`) that computes:
  - `id`, `sourceId`, `type`, `title`, `updatedAt`
  - `snippet`: trimmed excerpt (max 400 chars) from `doc.content` (which already passed through `pii` masking/hashing/dropping before SQLite upsert)
  - `piiCount` and `piiByType` (`Record<string, number>` from `doc.pii` finding `type`s — never matched text)
  - `guardRisk` (`computeRisk(doc.guard)` -> `"low" | "medium" | "high"`), `guardCount`, and `guardTypes` (distinct rule IDs/types from `doc.guard`)
- **Keyword search & filters**:
  - When `q` is non-empty, delegate to `Store.search(q, ...)` (which already supports JP/VN trigram FTS5 + short CJK `LIKE` fallback!) and apply `sourceId`, `type`, and `guardRisk` filters + offset/limit slicing.
  - When `q` is empty, query documents ordered by `updated_at DESC, id ASC` with `sourceId`, `type`, and `guardRisk` filters and `limit`/`offset` pagination (`total` count returned for pagination controls).

### 3. Safe `storePath` Handling in `packages/ui/src/server.ts`
- `CreateUiServerOptions.storePath?: string` stays optional so existing catalog-only tests work unchanged.
- `packages/cli/src/main.ts` (`cmdUi`) passes `storePath: structural.store.path` into `createUiServer`.
- On each `GET /api/documents` or `GET /api/health-summary` request:
  - If `!storePath || !existsSync(storePath)`, immediately return HTTP `200` with `{ storeExists: false, ...empty }` **without** instantiating `new Store(storePath)` (which would create an empty `.sqlite` file on disk).
  - When the SQLite file exists, open `new Store(storePath)`, execute read-only queries, and close `Store` in a `finally` block so background `knot-sync run` or `serve` processes never hit lingering UI write locks.

### 4. Read-Only & Fully-Local Guarantees
- **Read-only**: `/api/documents` and `/api/health-summary` accept `GET` only (`405` otherwise). UI server only ever writes `catalogPath` via existing `PUT /api/catalog`; customer source folders and databases are never opened or written.
- **Fully local**: All UI assets remain bundled locally via Vite (`packages/ui/static/`), served from `127.0.0.1`, with zero external requests or CDN links.

## Risks / Trade-offs

- **[Risk] Opening `Store` per UI API request while `knot-sync serve --sync-interval` runs concurrently** → SQLite WAL / short-lived read-only query + immediate `store.close()` in `finally` keeps lock duration to a few milliseconds; `Store` already configures `busy_timeout`.
- **[Risk] Legacy store created with `pii.mode: off` or `keepOriginalText: true`** → Omitting `metadata.originalContent` / `metadata.originalTables` and truncating `snippet` ensures UI never surfaces original unmasked buffers; additionally show a subtle localized reminder badge when documents have `piiCount > 0`.
