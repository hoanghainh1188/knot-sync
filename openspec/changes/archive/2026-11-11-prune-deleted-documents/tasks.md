# Tasks

## 1. Store pruning in `packages/store-sqlite`

- [x] 1.1 Add `PruneResult` interface (`{ pruned: number; prunedIds: string[] }`), `Store.hasAnyScan(): boolean`, and `Store.pruneStaleDocuments(sourceIds?: string[]): PruneResult` in `packages/store-sqlite/src/index.ts`. Compute live `documentId(sourceId, relPath)` sets per scanned source (`scanned_at:<sourceId>` in `meta`), delete stale rows from `documents` inside `this.tx(...)`, and delete matching `doc_id` rows from `document_embeddings` when that table exists.
- [x] 1.2 Add `node:test` unit tests in `packages/store-sqlite/src/store.test.ts` covering: pruning deleted JP/VI documents and verifying `documents_fts` search no longer hits them, pruning when a scanned source has 0 remaining files, preserving documents for unscanned sources, and deleting orphaned rows from `document_embeddings` when present (plus working normally when absent).

## 2. CLI `run` integration, i18n, and system logs in `packages/cli`

- [x] 2.1 Update `cmdRun` in `packages/cli/src/main.ts`: guard `run.noInventory` with `files.length === 0 && !store.hasAnyScan()`, run `store.pruneStaleDocuments(config.sources.map((s) => s.id))` before reporting results and triggering `embed_documents`, pass `pruned` to `run.complete`, and emit `appendSystemLogSafe(..., { level: "info", event: "run.prune", command: "run", count: pruned, storePath: structural.store.path })` when `pruned > 0`.
- [x] 2.2 Update `run.complete` in `packages/cli/src/i18n/{en,ja,vi}.ts` to include `{pruned}` and verify all locale catalogs stay aligned.
- [x] 2.3 Add `node:test` tests in `packages/cli/src/cli.test.ts`, `packages/cli/src/i18n/i18n.test.ts`, and `packages/search-vector/src/search-vector.test.ts` covering: deleting a JP/VI file + `scan` + `run` prunes the doc and FTS hit, deleting all files + `scan` + `run` exits 0 and prunes all docs, `run.prune` is written to `system.jsonl` without document bodies, `run.complete` reports `{pruned}` across `en`/`ja`/`vi`, and orphaned vector embeddings are cleaned when `document_embeddings` exists.

## 3. Documentation and verification

- [x] 3.1 Update `README.md` (if needed for `run` behavior) and mark `prune-deleted-documents` as `✅ done` in `docs/ROADMAP.md` (keeping required public-contract wording intact).
- [x] 3.2 Run `pnpm test` across all packages and confirm all tests pass with zero warnings/failures.
