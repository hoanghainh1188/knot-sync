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
