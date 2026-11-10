# document-search Specification

## Purpose

Stores normalized documents locally and finds them by keyword, with correct results for Japanese and Vietnamese text. No command exposes it yet; the MCP server will.

## Requirements

### Requirement: Keyword search with AND semantics
Search SHALL split the query on whitespace and return only documents whose title or content contain every term, case-insensitively, limited to at most 100 results.

#### Scenario: Japanese term
- **GIVEN** a document titled `令和6年度 請求書一覧`
- **WHEN** the user searches `請求書`
- **THEN** that document is returned

#### Scenario: Vietnamese term
- **GIVEN** a document titled `Hóa đơn tháng 5`
- **WHEN** the user searches `hóa đơn`
- **THEN** that document is returned

#### Scenario: All terms must match
- **WHEN** the query has two terms and a document contains only one of them
- **THEN** that document is not returned

### Requirement: Short terms are supported
Terms shorter than three characters, common in Japanese (for example `請求`), SHALL still return matching documents.

#### Scenario: Two-character Japanese term
- **WHEN** the user searches `請求`
- **THEN** documents containing `請求` are returned

### Requirement: Search input is safe
Quotes, `%`, `_` and other special characters in the query SHALL be treated as plain text and SHALL NOT cause an error.

#### Scenario: Special characters
- **WHEN** the user searches `"quote" 100%`
- **THEN** the search completes without error

### Requirement: Updated documents are re-indexed
When a document is stored again with the same id, search SHALL reflect only its new title and content.

#### Scenario: Old content disappears
- **WHEN** a document's content changes from `旧内容テキスト` to `新しい内容テキスト`
- **THEN** searching `旧内容` returns nothing and searching `新しい` returns the document

### Requirement: Search hits include a snippet
Each hit SHALL include the document id, source id, type, title and a short snippet around the first matching term.

#### Scenario: Snippet
- **WHEN** a long document matches
- **THEN** the hit's snippet contains the matching term

### Requirement: Optional source and type filters

Search SHALL accept optional filters for `sourceId` and document `type`. When
provided, only documents matching those filters SHALL be returned. When omitted,
behavior remains as in prior requirements (all sources and types).

#### Scenario: Filter by source id

- **GIVEN** documents in sources `share` and `other`
- **WHEN** search runs with query `請求書` and `sourceId: "share"`
- **THEN** only documents from `share` are returned

#### Scenario: Filter by type

- **WHEN** search runs with a query and `type: "xlsx"`
- **THEN** hits whose type is not `xlsx` are excluded

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

### Requirement: FTS remains independent of vector search

Keyword FTS5 search (`search` / `search_documents`) SHALL continue to work
without the search-vector plugin and WITHOUT requiring a local embedding
endpoint. Vector retrieval is additive and MUST NOT replace or break FTS
behavior for Japanese/Vietnamese short terms.

#### Scenario: FTS works with vector plugin unloaded

- **GIVEN** no search-vector plugin under `plugins:`
- **WHEN** the operator searches for `請求書` via FTS
- **THEN** matching cleaned documents are returned as today
