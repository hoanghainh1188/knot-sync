## ADDED Requirements

### Requirement: Prune deleted source files from documents and FTS index

`Store` SHALL provide `pruneStaleDocuments(sourceIds?)` and `hasAnyScan()`. For each targeted source with a `scanned_at:<sourceId>` marker in `meta`, pruning SHALL delete `documents` rows whose `id` is absent from `files` for that source, triggering removal from `documents_fts`. `knot-sync run` SHALL invoke pruning for configured sources without modifying customer source folders.

#### Scenario: Deleted Japanese document disappears from store and search

- **GIVEN** a scanned folder source containing `令和6年度_請求書.xlsx` and `メモ.txt` that have been extracted via `knot-sync run`
- **WHEN** `令和6年度_請求書.xlsx` is removed from the folder and the operator runs `knot-sync scan` followed by `knot-sync run`
- **THEN** `Store.getDocument` returns `null` for `令和6年度_請求書.xlsx`
- **AND** searching `請求書` returns zero hits while searching content from `メモ.txt` still returns `メモ.txt`
- **AND** remaining files in the source folder are untouched

#### Scenario: Deleting all files in a scanned folder prunes all documents for that source

- **GIVEN** a scanned source `share` with previously extracted Vietnamese document `Hóa đơn tháng 5.txt`
- **WHEN** all files are removed from `share` and the operator runs `knot-sync scan` followed by `knot-sync run`
- **THEN** `knot-sync run` exits 0 instead of failing with missing inventory
- **AND** `Hóa đơn tháng 5.txt` is pruned from `documents` and `documents_fts`

#### Scenario: Unscanned source documents are preserved

- **GIVEN** a document stored under source `manual` with no `scanned_at:manual` marker in `meta`
- **WHEN** `pruneStaleDocuments()` runs after scanning another source `share`
- **THEN** the document under `manual` remains in `documents` and searchable
