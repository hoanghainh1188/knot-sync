# Design

## Context

See `proposal.md` for motivation. `packages/mcp-server` currently fetches the full `Document` from `Store.getDocument(id)` and renders the entire `doc.content` and `doc.tables` via `frameDocument` and `framedDocumentText`.

## Goals / Non-Goals

**Goals:**
- Allow AI agents to inspect large documents and multi-sheet workbooks incrementally with zero breaking changes to existing `get_document({ id })` callers.
- Expose `totalChars` and `tableCount` upfront in `search_documents` hits and `get_document` headers so agents can plan slice-by-slice reads.
- Preserve `UNTRUSTED_DOCUMENT_CONTENT` framing, guard findings/risk, read-only store/source guarantees, and fully-local execution (no network calls, no new dependencies).

**Non-Goals:**
- Changing SQLite storage schema or introducing persisted chunk tables in `store-sqlite`.
- Changing `knot://docs/{source}/{doc_id}` resource behavior.
- Token-count estimation using external tokenizer libraries.

## Decisions

1. **Character-based slicing (`offset`, `maxChars`) on `doc.content` at MCP framing time**
   - `offset` defaults to `0` (non-negative integer); `maxChars` is optional (positive integer).
   - When `maxChars` is provided, `slicedContent = doc.content.slice(offset, offset + maxChars)`. When omitted and `offset > 0`, `slicedContent = doc.content.slice(offset)`.
   - `hasMore` is `offset + slicedContent.length < doc.content.length`.
   - Alternative considered: line-based or token-based chunking. Character slicing is deterministic, requires zero tokenizer dependencies, and handles CJK/Vietnamese text without line-length skew (e.g., minified tables or long single-line paragraphs).

2. **Table filtering (`tableIndex`, `includeTables`)**
   - `includeTables` defaults to `true`.
   - If `tableIndex` is specified: validate `0 <= tableIndex < doc.tables.length`. If out of range (including when `doc.tables.length === 0`), return `status: "invalid_argument"` / clear out-of-range message (consistent with `not_found` handling in `handleGetDocument`). When valid, include only `[doc.tables[tableIndex]]` and record `selectedTableIndex: tableIndex` in the header.
   - If `tableIndex` is omitted and `includeTables === false`: return `tables: []` in the framed output while preserving `tableCount: doc.tables.length` in the header.
   - Alternative considered: separate `get_document_table` MCP tool. Extending `get_document` keeps the MCP tool surface minimal and matches Issue #54.

3. **Header & metadata layout (`frame.ts` & `tools.ts`)**
   - `framedDocumentText` always keeps `UNTRUSTED_DOCUMENT_CONTENT`, `id`, `sourceId`, `type`, `title`, `guardRisk`, `guardFindings`, and adds `totalChars`, `tableCount`, plus `offset`, `returnedChars`, `hasMore` (when `offset > 0` or `maxChars !== undefined`) and `selectedTableIndex` (when `tableIndex !== undefined`).
   - `frameSearchHit` includes `totalChars` and `tableCount` when provided by `handleSearchDocuments`.
   - `server.ts` audit log for `get_document` records `{ id, offset, maxChars, tableIndex, includeTables }` (only defined keys) without logging document bodies.

4. **Read-only & Fully-local guarantees**
   - All slicing and filtering operates purely in memory on the read-only `Document` object returned by `store.getDocument(id)`. No files in customer sources are touched, no SQLite rows are mutated, and no network calls are made.

## Risks / Trade-offs

- **UTF-16 code unit surrogate splitting**: JavaScript `String.prototype.slice` operates on UTF-16 code units, which could theoretically split a rare 4-byte emoji/surrogate pair if `offset`/`maxChars` lands mid-pair. → Mitigation: acceptable for BMP Japanese/Vietnamese/ASCII enterprise text; no external segmentation dependency needed.
- **Large single table**: A single Excel sheet with 10,000 rows selected via `tableIndex` can still be large. → Mitigation: `tableIndex` isolates one sheet at a time (covering the primary 12-sheet workbook pain point); row-level pagination can be added additively later if needed.
