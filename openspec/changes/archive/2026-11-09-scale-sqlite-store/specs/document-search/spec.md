# Spec Delta

## ADDED Requirements

### Requirement: Batched document upserts

The store SHALL provide a batched upsert API that writes documents in
transactions of at most **500** documents per commit (exact constant documented
in design). Callers that ingest many documents in one pass (notably
`knot-sync run`) SHALL use batching rather than one auto-commit per document.
Single-document `upsertDocument` SHALL remain available and correct. Search
after a completed batch SHALL return the same results as equivalent per-row
upserts.

#### Scenario: Batch of Japanese documents is searchable

- **GIVEN** a batch upsert of documents including one titled `令和6年度 請求書一覧`
- **WHEN** search runs with query `請求書`
- **THEN** that document is returned

#### Scenario: Partial batch failure rolls back the open transaction

- **WHEN** a batched upsert throws mid-transaction
- **THEN** none of the documents from that incomplete transaction are committed
- **AND** previously committed batches remain intact

### Requirement: optimize CLI command

`knot-sync optimize` SHALL open the configured store and run FTS5 index
maintenance (`INSERT INTO documents_fts(documents_fts) VALUES('optimize')` or
equivalent) plus `PRAGMA wal_checkpoint(TRUNCATE)`. It SHALL exit 0 on success
and exit 1 on config/store errors with an actionable message. Help text SHALL
list `optimize`. The command MUST NOT write, move, or delete anything under
configured source paths.

#### Scenario: Help lists optimize

- **WHEN** the user runs `knot-sync --help`
- **THEN** the help text includes the `optimize` command

#### Scenario: Optimize succeeds on a store with Japanese documents

- **GIVEN** a store that already contains a document titled `請求書`
- **WHEN** the user runs `knot-sync optimize -c <config>`
- **THEN** the process exits 0
- **AND** subsequent search for `請求書` still returns that document

#### Scenario: Missing store guidance

- **WHEN** `knot-sync optimize` cannot open the configured store
- **THEN** the process exits non-zero
- **AND** stderr tells the user what to fix next (e.g. run `init` / `scan` /
  `run` first)

### Requirement: Large-index load script

The repository SHALL include an offline load/stress script (documented path)
that can populate and query a temporary SQLite store with at least **50,000**
documents and report search latency and approximate memory use. The script
MUST NOT require network access or write into customer source folders.

#### Scenario: Script runs offline at 50k scale

- **WHEN** an operator runs the documented load script targeting ≥50k documents
- **THEN** it completes without network calls
- **AND** it prints latency (and memory if available) for at least one search
