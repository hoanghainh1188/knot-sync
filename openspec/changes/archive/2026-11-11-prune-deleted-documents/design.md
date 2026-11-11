# Design

## Overview

`prune-deleted-documents` closes the local index lifecycle loop between `knot-sync scan` (which refreshes `files` per scanned source) and `knot-sync run` (which previously only inserted/updated `documents`).

## Architecture & Key Decisions

### 1. Scanned-source guard via `meta` (`scanned_at:<sourceId>`)

- `Store.replaceScan(sourceId, files, issues)` already writes `scanned_at:<sourceId>` into the `meta` table inside the same transaction that replaces `files` for `sourceId`.
- `Store.pruneStaleDocuments(sourceIds?: string[])` only prunes a source `S` when `scanned_at:S` is present in `meta` (and when `sourceIds` is provided, only for `S` in `sourceIds`).
- Why: If a source has never been scanned (or a unit test inserted documents directly with `upsertDocument` without running `replaceScan`), `files` has zero rows for that source; without the `scanned_at:` guard, pruning would mistakenly delete valid documents. Conversely, when an operator genuinely deletes every file in a scanned folder and runs `knot-sync scan`, `replaceScan(S, [], [])` records `scanned_at:S` with empty `files`, allowing `run` to prune all remaining documents for `S`.

### 2. Distinguishing "never scanned" vs "scanned empty folder" in `cmdRun`

- Currently `cmdRun` aborts with exit code 1 (`run.noInventory`) whenever `store.listFiles().length === 0`.
- With `Store.hasAnyScan()` (`SELECT 1 FROM meta WHERE key LIKE 'scanned_at:%' LIMIT 1`), `cmdRun` only exits 1 with `run.noInventory` when BOTH `files.length === 0` AND `!store.hasAnyScan()`.
- When `hasAnyScan()` is true and `files.length === 0`, `cmdRun` runs `store.pruneStaleDocuments(configuredSourceIds)`, reports `0 extracted, 0 unchanged, <N> pruned, 0 issues`, logs `run.prune` if `N > 0`, and exits 0.

### 3. Avoiding SQLite host-parameter limits at 50k+ documents

- KnotSync supports stores with 50,000+ documents (`scale-sqlite-store`). Using `DELETE FROM documents WHERE source_id = ? AND id NOT IN (?, ?, ...)` can exceed `SQLITE_MAX_VARIABLE_NUMBER` when a source contains tens of thousands of files.
- Instead, `pruneStaleDocuments` runs inside a SQLite transaction:
  1. Reads `rel_path` from `files WHERE source_id = ?` and builds a `Set<string>` of live `documentId(sourceId, relPath)` values in JS.
  2. Reads `id` from `documents WHERE source_id = ?` and collects `staleIds` not present in the live set.
  3. Executes a prepared `DELETE FROM documents WHERE id = ?` for each ID in `staleIds` inside `this.tx(...)`. The existing `documents_ad` AFTER DELETE trigger removes each row from `documents_fts` automatically.

### 4. Decoupled cleanup of `document_embeddings`

- The paid `search-vector` plugin stores vectors in a `document_embeddings(doc_id, model, ...)` table inside the same `store.db` SQLite file.
- Open-core packages must never import or depend on paid plugins.
- Inside the same transaction in `pruneStaleDocuments`, `Store` checks `sqlite_master` (`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'document_embeddings'`). If present and `staleIds.length > 0`, it runs a prepared `DELETE FROM document_embeddings WHERE doc_id = ?` for each pruned ID. If the plugin was never used, this check is a fast metadata lookup with zero side effects.

### 5. Read-only and fully local guarantees

- All reads from customer folders happen in `knot-sync scan` (via `connector-fs`), which opens files read-only and never creates, moves, or deletes anything inside configured source directories.
- `pruneStaleDocuments` modifies only the local SQLite database (`store.path`) and `cmdRun` appends only narrow operational counts (`count`, `storePath`) to the local JSONL system log outside all source roots. No network calls or telemetry occur.
