# Proposal

## Why

Large customer corpora (tens of thousands of documents) make per-row
`upsertDocument` commits and unoptimized FTS5 indexes slow and I/O heavy.
Production readiness (v0.3 P2) needs batched writes, an operator `optimize`
command, and offline load scripts so we can validate latency/memory before
claiming >100k readiness.

## What Changes

- Add batched document upserts on the SQLite store (chunked transactions,
  default **500** docs per transaction) and use them from `knot-sync run`
  where many documents are written in one pass
- Add `knot-sync optimize` to run FTS5 optimize and
  `PRAGMA wal_checkpoint(TRUNCATE)` on the configured store, with clear
  success/error messages (en/ja/vi via existing CLI i18n)
- Add offline load/stress scripts (or package-local runners) that build and
  query indices at **50k+** documents and report latency/memory without
  network calls
- Document the new command and batching behavior; mark the roadmap item done

**No new third-party dependencies** (Node built-ins + workspace only).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `document-search`: batched upserts, store maintenance (`optimize` / FTS + WAL
  checkpoint), and documented load/stress verification for large indices
- `cli-i18n`: strings for the new `optimize` command (help, progress, errors)

## Impact

- Code: `packages/store-sqlite` (batch API + optimize helpers), `packages/cli`
  (`run` batching, `optimize` command, i18n), optional `scripts/` stress runner
- Config: no new required keys; batch size may be a documented constant or
  optional config later (default 500 in this change)
- Dependencies: none added
- Runtime: still fully local; never writes customer sources

## Out of scope

- Remote/replicated SQLite, libSQL, or switching away from `node:sqlite`
- Concurrent multi-writer servers or connection pooling for the store file
- Changing FTS tokenizer (trigram stays)
- Vector / embedding search (paid)
- Guaranteeing sub-second search at 100k on every machine—scripts measure;
  SLOs are informational
- System logging overhaul (Later roadmap)
