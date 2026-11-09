# Design

## Context

See proposal.md — Why. Today `Store.upsertDocument` issues one prepared
`INSERT … ON CONFLICT` per call with SQLite auto-commit; `run` loops files and
upserts one-by-one. WAL is already enabled. FTS5 external-content triggers keep
`documents_fts` in sync. There is no `optimize` CLI and no large-index harness
beyond small unit tests / `bench` (token/tool accuracy).

## Goals / Non-Goals

**Goals:**

- Cut fsync/lock overhead for bulk `run` via chunked transactions (500)
- Give operators a safe, read-only-to-sources `optimize` that shrinks WAL/FTS
- Provide an offline 50k+ script for latency/memory visibility

**Non-Goals:**

- Changing schema version or trigram tokenizer
- Multi-process writers or server mode for SQLite
- Merging stress metrics into `knot-sync bench` product report

## Decisions

### 1. `upsertDocuments(docs, { chunkSize?: number })`

**Choice:** Add `Store.upsertDocuments(docs: Document[], options?)` that
chunks at `DEFAULT_UPSERT_CHUNK = 500`, each chunk in `BEGIN`/`COMMIT` via
existing `tx()`. Empty array is a no-op. Keep `upsertDocument` as a thin
single-item path (either call batch of 1 or share the same prepared statement).

**Alternatives:** Only change CLI to wrap `BEGIN` around the whole run —
rejected; a multi-hour run would hold one huge transaction. Chunked API is
reusable and testable.

### 2. Wire `run` to buffer successful documents

**Choice:** In `cmdRun`, accumulate documents destined for upsert and flush
every 500 (and on loop end). Error/blocked docs may still use single upsert
or join the same buffer—prefer same batch path for simplicity when order of
visibility mid-run is not user-facing.

**Alternatives:** Async queue — unnecessary complexity for Node sync `node:sqlite`.

### 3. `Store.optimize()`

**Choice:** Method that runs:

1. `INSERT INTO documents_fts(documents_fts) VALUES('optimize');`
2. `PRAGMA wal_checkpoint(TRUNCATE);`

Return a small summary `{ ftsOptimized: true, checkpoint: … }` for CLI text.
Errors surface as thrown Error with actionable message.

### 4. CLI `optimize`

**Choice:** New command next to `bench`/`serve`: load config, open store,
call `optimize()`, print localized success, close store. Exit codes: 0 / 1 / 2
per project conventions.

### 5. Load script location

**Choice:** `scripts/store-load-stress.mjs` (or `.ts` run via `node --experimental…`
/ built dist) under repo root `scripts/`, invoked by documented
`pnpm` script `store:stress`. Generates synthetic JP/VN-titled docs in a temp
dir DB, searches a JP term, prints ms and `process.memoryUsage()`. Cap default
at 50_000 with `--count` override. Not part of default `pnpm test` CI matrix
(too slow)—opt-in only; unit tests cover batch/optimize with small N.

**Alternatives:** Only document manual steps — weaker; a script is the
acceptance artifact.

### 6. Read-only / fully local

Optimize and stress touch only the KnotSync store DB (or a temp DB). No source
path writes. No network.

### 7. i18n

Add message keys for optimize help/success/errors in `en`/`ja`/`vi` catalogs;
follow existing `t(locale, key)` patterns.

## Risks / Trade-offs

- **[Mid-run crash loses current chunk]** → Acceptable; prior chunks committed;
  `run` is already resumable via hash skip
- **[FTS optimize locks DB]** → Document that `serve`/`run` should be stopped
  during optimize
- **[50k script runtime on CI]** → Keep out of default test job; local/manual
- **[Batch size too large for low-RAM]** → 500 is conservative; constant easy to
  lower later via options

## Migration Plan

- No schema migration
- Existing stores benefit after upgrade + optional `optimize`
- Rollback: revert commits; single upsert path remains

## Open Questions

None — chunk size 500 and script defaults are fixed for this change; tuning
later does not require renames.
