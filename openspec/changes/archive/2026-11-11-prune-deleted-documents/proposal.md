# Proposal

## Why

Today `Store.replaceScan` replaces rows in `files` for each scanned source, but `documents`, `documents_fts`, and optional `document_embeddings` never remove entries when source files are deleted from the monitored directory. As a result:

1. AI agents calling MCP tools (`search_documents`, `get_document`, `search_similar`) can continue retrieving stale or deleted documents after a customer removes files and re-runs `knot-sync scan` + `knot-sync run`.
2. If all files in a scanned folder are deleted and the operator runs `knot-sync scan` followed by `knot-sync run`, `cmdRun` currently treats `files.length === 0` as "no scan inventory found" (`run.noInventory`, exit code 1) instead of pruning the removed documents cleanly.

## What Changes

- **Store pruning API (`packages/store-sqlite`)**:
  - Add `Store.hasAnyScan(): boolean` (checks whether at least one `scanned_at:*` marker exists in `meta`).
  - Add `Store.pruneStaleDocuments(sourceIds?: string[]): PruneResult` returning `{ pruned: number; prunedIds: string[] }`.
  - For each targeted source that has a `scanned_at:<sourceId>` inventory marker, compute live document IDs from `files` (`documentId(sourceId, relPath)`) and atomically delete stale rows from `documents` inside a transaction (which also removes their `documents_fts` entries via the existing `documents_ad` trigger).
  - When the optional `document_embeddings` table exists in `store.db`, delete orphaned embedding rows for the pruned `doc_id`s inside the same transaction without importing `packages/search-vector`.
- **CLI `run` integration, i18n, and system logs (`packages/cli`)**:
  - Allow `knot-sync run` to proceed cleanly when `files.length === 0` if `store.hasAnyScan()` is true (keep `run.noInventory` + exit code 1 only when no scan has ever been recorded).
  - Run `store.pruneStaleDocuments(sourceIds)` for configured sources during `knot-sync run` (after upserting extracted/updated documents and before `embed_documents` when `embedOnRun` is enabled).
  - Update `run.complete` messages in `en`, `ja`, and `vi` to include the pruned count (`{pruned}`).
  - Append a `run.prune` (`level: "info"`, `command: "run"`, `count`, `storePath`) event to the local JSONL system log when `pruned > 0`.

**Out of scope**

- Pruning documents belonging to `sourceId`s that were removed from config or never scanned (only sources present in the active run and backed by a `scanned_at:<sourceId>` scan inventory are pruned).
- Running periodic background `scan` + `run` inside `knot-sync serve` (deferred to `add-periodic-sync` in v0.4).
- Automatically running `FTS5 optimize` or `VACUUM` after pruning (operators use `knot-sync optimize`).
- Any write, move, or delete operation inside configured customer source folders.
- New third-party dependencies (none; uses existing workspace packages and Node.js built-ins).

## Capabilities

### Modified Capabilities

- `document-search`: Prune stale `documents` and `documents_fts` entries for deleted source files during `knot-sync run`.
- `vector-search`: Clean orphaned `document_embeddings` rows for pruned documents when the vector table exists in the SQLite store.
- `cli-i18n`: Report the pruned document count in localized `run` output (`en`, `ja`, `vi`) and distinguish empty post-scan folders from missing initial scans.
- `system-logs`: Emit a `run.prune` JSONL event with `count` and `storePath` (never document content or PII) when stale documents are pruned.

## Impact

- Code: `packages/store-sqlite/src/index.ts`, `packages/cli/src/main.ts`, `packages/cli/src/i18n/{messages,en,ja,vi}.ts`.
- Docs: `README.md` (if `run` behavior/output summary needs updating) and `docs/ROADMAP.md` (`v0.4` status for `prune-deleted-documents`).
- Tests: `packages/store-sqlite/src/store.test.ts`, `packages/cli/src/cli.test.ts`, `packages/cli/src/i18n/i18n.test.ts`, `packages/search-vector/src/search-vector.test.ts`.
- Dependencies: None.
- Runtime / Security: Strictly read-only to customer sources; fully local; no network calls or telemetry.
