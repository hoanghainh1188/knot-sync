# Proposal

## Why

Enterprise documents such as 50-page `.pdf`/`.docx` contracts and 12-sheet `.xlsx`/`.xls` workbooks often contain 20,000–50,000+ tokens. Because `get_document` currently returns the entire normalized body and all extracted tables in one MCP response, a single tool call can overflow or crowd an AI agent's context window, increase token cost, and degrade reasoning accuracy.

## What Changes

- Extend `get_document` in `packages/mcp-server` with optional, backward-compatible parameters:
  - `offset?: number` (0-based character offset into `doc.content`, default `0`)
  - `maxChars?: number` (positive integer maximum content characters to return in this slice)
  - `tableIndex?: number` (0-based index selecting a single extracted table/sheet)
  - `includeTables?: boolean` (whether to include extracted tables; defaults to `true` when `tableIndex` is omitted)
- Surface pagination and structure metadata (`offset`, `returnedChars`, `totalChars`, `hasMore`, `tableCount`, and `tableNames` when available) in `get_document` framed headers, and surface `totalChars` and `tableCount` in `search_documents` hit summaries so AI agents can decide upfront when to paginate or fetch a specific sheet/table.
- Keep `UNTRUSTED_DOCUMENT_CONTENT` framing and `guard` findings intact on every paginated slice, and log pagination/table arguments in the MCP JSONL audit log.
- Out of scope: changing `knot://docs/{source}/{doc_id}` resource URI format, changing `store-sqlite` schema or ingestion chunking, adding write/mutation tools (deferred until v1.0+), or any paid plugin features.
- No new third-party dependencies.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `mcp-server`: Extend `get_document tool` with optional character pagination (`offset`, `maxChars`) and table/sheet selection (`tableIndex`, `includeTables`) plus slice/size metadata headers, and extend `search_documents tool` hit metadata with `totalChars` and `tableCount`.

## Impact

- `packages/mcp-server/src/tools.ts`: `getDocumentInput` Zod schema, `handleGetDocument`, `handleSearchDocuments`, and plugin tool JSON schema.
- `packages/mcp-server/src/frame.ts`: `FramedDocumentPayload`, `frameDocument`, `frameSearchHit`, and `framedDocumentText`.
- `packages/mcp-server/src/server.ts`: `get_document` audit log argument recording.
- `packages/mcp-server/src/mcp-server.test.ts`: Unit tests covering backward-compatible full fetch, character slicing (`offset` + `maxChars`), `tableIndex` selection, `includeTables: false`, out-of-range `tableIndex`, and Japanese/Vietnamese multi-byte/CJK text pagination.
- `README.md`, `docs/ROADMAP.md`, `packages/cli/README.md`: Documentation updates for `get_document` parameters and v0.5 status.
