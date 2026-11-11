# vector-search Specification

## Purpose

Provides opt-in, licensed local embedding storage and cosine similarity search
over cleaned KnotSync documents so agents can find semantically similar content
via MCP—without replacing FTS5 or requiring native SQLite extensions.

## Requirements

### Requirement: Opt-in search-vector plugin

The system SHALL provide a search-vector plugin (not loaded as a default
built-in) that operators enable under config `plugins:`. When loaded and
licensed, vector embedding and `search_similar` SHALL be available. When
omitted, search SHALL remain FTS5-only.

#### Scenario: Plugin omitted keeps FTS only

- **GIVEN** config does not list the search-vector plugin
- **WHEN** the user runs `knot-sync plugins` or uses MCP search tools
- **THEN** no vector Catalog/MCP vector tool from this plugin is registered
- **AND** `search_documents` still works as today

#### Scenario: Licensed plugin enables vector path

- **GIVEN** search-vector is listed with a valid license and local embedding
  endpoint configured
- **WHEN** plugins load successfully
- **THEN** `knot-sync plugins` lists the search-vector plugin
- **AND** `search_similar` is available to MCP clients

### Requirement: License self-check

The search-vector plugin SHALL validate its own license before embedding or
serving vector search. The KnotSync core SHALL NOT implement that check.
Missing/invalid license SHALL leave vector features unusable with guidance to
set the documented license env/key.

#### Scenario: Missing license blocks embed and search_similar

- **GIVEN** the plugin path is listed but no valid license is configured
- **WHEN** embed or `search_similar` would run
- **THEN** no embedding HTTP request is made for that path
- **AND** the operator sees how to set the license

### Requirement: Local OpenAI-compatible embeddings

Embedding requests SHALL target a configured local OpenAI-compatible HTTP base
URL (default loopback). Operators MAY point that URL at Ollama or a Docker
embedding server. Cloud vendor endpoints SHALL NOT be required or hard-coded.
Requests MUST NOT write to customer source folders.

#### Scenario: Default targets localhost

- **GIVEN** licensed plugin with default base URL settings
- **WHEN** an embedding request runs
- **THEN** the HTTP call uses a loopback (or documented local) base URL
- **AND** no cloud embedding hostname is hard-coded

### Requirement: SQLite vectors + JS cosine

Embeddings SHALL be stored in SQLite (table managed for this feature) as
numeric vectors. Similarity ranking SHALL use cosine similarity computed in
JavaScript (or equivalent pure-JS). Native SQLite vector extensions SHALL NOT
be required.

#### Scenario: Similar Japanese invoice found by paraphrase query

- **GIVEN** a cleaned document titled about `令和6年度 請求書` is embedded
- **AND** a licensed local embedding endpoint is available
- **WHEN** `search_similar` is called with a Japanese paraphrase of that invoice
- **THEN** the document appears among top hits with a similarity score
- **AND** returned text remains framed as untrusted document content

### Requirement: Batch and lazy embedding

The system SHALL support batch embedding of stored cleaned documents (CLI
`embed` and/or hook during `run` when the plugin is loaded) and SHALL lazily
embed documents missing vectors when `search_similar` needs them (subject to
timeouts/limits). Failures for individual documents SHALL soft-fail without
aborting the whole batch when possible.

#### Scenario: embed indexes cleaned documents

- **GIVEN** licensed plugin and documents already in the store from `run`
- **WHEN** the operator runs the documented embed command
- **THEN** embeddings are written for those documents (or skipped if unchanged)
- **AND** source files under configured roots remain unchanged

#### Scenario: Lazy fill on search_similar

- **GIVEN** a stored document without an embedding row
- **AND** the local endpoint is healthy
- **WHEN** `search_similar` runs
- **THEN** the missing document MAY be embedded before ranking
- **AND** a subsequent search can reuse the stored vector

### Requirement: Soft-fail on local endpoint errors

When the local embedding endpoint is unreachable, times out, or returns invalid
data, embed/`search_similar` SHALL soft-fail with actionable guidance (check
URL/model/Docker/Ollama). Customer sources MUST remain unmodified. FTS
`search_documents` MUST remain usable independently.

#### Scenario: Ollama down does not break FTS

- **GIVEN** search-vector loaded but the embedding endpoint is down
- **WHEN** the client calls `search_documents`
- **THEN** FTS search still returns keyword hits as today

### Requirement: Prune orphaned vector embeddings when documents are pruned

When the `document_embeddings` table exists in the SQLite store, pruning stale documents SHALL also delete rows in `document_embeddings` whose `doc_id` matches a pruned document ID, within the same store transaction. When `document_embeddings` does not exist, pruning SHALL succeed normally without creating it.

#### Scenario: Orphaned Japanese document embedding removed on prune

- **GIVEN** a store with `document_embeddings` populated for a document titled `請求書2026`
- **WHEN** the underlying file is deleted from the source folder and `knot-sync scan` followed by `knot-sync run` executes
- **THEN** the row for that document ID in `document_embeddings` is deleted
- **AND** `search_similar` no longer returns the deleted document
