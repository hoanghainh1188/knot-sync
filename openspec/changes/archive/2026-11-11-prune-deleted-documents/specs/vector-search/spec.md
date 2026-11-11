## ADDED Requirements

### Requirement: Prune orphaned vector embeddings when documents are pruned

When the `document_embeddings` table exists in the SQLite store, pruning stale documents SHALL also delete rows in `document_embeddings` whose `doc_id` matches a pruned document ID, within the same store transaction. When `document_embeddings` does not exist, pruning SHALL succeed normally without creating it.

#### Scenario: Orphaned Japanese document embedding removed on prune

- **GIVEN** a store with `document_embeddings` populated for a document titled `請求書2026`
- **WHEN** the underlying file is deleted from the source folder and `knot-sync scan` followed by `knot-sync run` executes
- **THEN** the row for that document ID in `document_embeddings` is deleted
- **AND** `search_similar` no longer returns the deleted document
