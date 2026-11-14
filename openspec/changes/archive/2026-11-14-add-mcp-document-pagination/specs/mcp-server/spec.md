# Spec Delta

## MODIFIED Requirements

### Requirement: search_documents tool

The server SHALL register tool `search_documents` with a strict Zod (or
equivalent) input schema accepting: `query` (string, required), optional
`source` (source id), optional `type` (document type), and optional `limit`
(positive integer, capped at 100). Results SHALL use the document-search
capability and include id, source, type, title, snippet, and document size
metadata (`totalChars` and `tableCount`) when the stored document is available.
Document text in the tool result SHALL be framed as untrusted content. Guard
risk/flags SHALL be included when present on matching documents.

#### Scenario: Search Japanese term

- **GIVEN** a document containing `請求書`
- **WHEN** the tool is called with `query: "請求書"`
- **THEN** that document appears in the hits
- **AND** the result text states that document content is untrusted data
- **AND** the hit includes `totalChars` and `tableCount` metadata

#### Scenario: Filter by source

- **WHEN** the tool is called with `query` and `source: "share"`
- **THEN** only hits from source `share` are returned

### Requirement: get_document tool

The server SHALL register tool `get_document` with a strict input schema
requiring document `id` and accepting optional `offset` (non-negative integer,
default `0`), `maxChars` (positive integer), `tableIndex` (non-negative integer),
and `includeTables` (boolean, default `true`). On success it SHALL return title,
type, source id, slice/structure metadata (`totalChars`, `tableCount`, and
pagination fields when sliced), content, and selected tables framed as untrusted
document content, plus guard findings/risk when present. Missing ids SHALL
return a clear not-found error without mutating the store.

#### Scenario: Get by id

- **WHEN** the tool is called with an existing document id and no optional parameters
- **THEN** the response includes that document’s full content and all tables framed as untrusted
- **AND** if the document has guard findings, they are included in the result

#### Scenario: Paginate long Japanese document by offset and maxChars

- **GIVEN** a stored Japanese document `令和6年度_契約書.pdf` with 1,200 characters of content
- **WHEN** the tool is called with `offset: 400` and `maxChars: 300`
- **THEN** the response includes only the 300-character slice starting at character index 400
- **AND** the framed header includes `offset: 400`, `returnedChars: 300`, `totalChars: 1200`, `hasMore: true`, and `UNTRUSTED_DOCUMENT_CONTENT` framing

#### Scenario: Select a single table or sheet by tableIndex

- **GIVEN** a stored workbook `Báo cáo tài chính.xlsx` with 3 extracted tables (`Doanh thu`, `Chi phí`, `Lợi nhuận`)
- **WHEN** the tool is called with `tableIndex: 1`
- **THEN** the response includes only the second table (`Chi phí`) in the tables section
- **AND** the framed header includes `tableCount: 3` and `selectedTableIndex: 1`

#### Scenario: Omit tables when includeTables is false

- **GIVEN** a stored document with both text content and extracted tables
- **WHEN** the tool is called with `includeTables: false` and no `tableIndex`
- **THEN** the response omits the tables JSON section while still reporting `tableCount` in the header

#### Scenario: Out-of-range tableIndex returns clear error

- **GIVEN** a stored document with 2 tables (`tableCount: 2`)
- **WHEN** the tool is called with `tableIndex: 5`
- **THEN** the tool returns a clear error indicating the requested `tableIndex` is out of range (`0..1`) without mutating the store
