# Spec Delta

## ADDED Requirements

### Requirement: FTS remains independent of vector search

Keyword FTS5 search (`search` / `search_documents`) SHALL continue to work
without the search-vector plugin and WITHOUT requiring a local embedding
endpoint. Vector retrieval is additive and MUST NOT replace or break FTS
behavior for Japanese/Vietnamese short terms.

#### Scenario: FTS works with vector plugin unloaded

- **GIVEN** no search-vector plugin under `plugins:`
- **WHEN** the operator searches for `請求書` via FTS
- **THEN** matching cleaned documents are returned as today
