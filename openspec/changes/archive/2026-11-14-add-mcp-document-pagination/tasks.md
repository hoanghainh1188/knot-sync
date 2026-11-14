# Tasks

## 1. Framing & Metadata Support (`packages/mcp-server/src/frame.ts`)

- [x] 1.1 Extend `FramedDocumentPayload`, `frameDocument`, and `framedDocumentText` to accept optional pagination and table selection options (`offset`, `maxChars`, `tableIndex`, `includeTables`), include `totalChars` and `tableCount` in all `get_document` headers, and include `offset`, `returnedChars`, `hasMore`, and `selectedTableIndex` when slicing/selecting; verify `pnpm --filter @hoanghainh/knot-sync-mcp-server build` succeeds.
- [x] 1.2 Extend `frameSearchHit` to render `totalChars` and `tableCount` when provided; add unit tests in `packages/mcp-server/src/mcp-server.test.ts` verifying backward-compatible full framing, `totalChars`/`tableCount` headers, and Japanese/Vietnamese text slicing and verify `node --test packages/mcp-server/dist/mcp-server.test.js` passes.

## 2. MCP Tool Schema, Handlers & Audit Logging (`packages/mcp-server/src/tools.ts`, `server.ts`)

- [x] 2.1 Extend `getDocumentInput` Zod schema and plugin JSON schema in `packages/mcp-server/src/tools.ts` with optional `offset` (int >= 0), `maxChars` (int > 0), `tableIndex` (int >= 0), and `includeTables` (boolean), and update `handleGetDocument` to slice `doc.content`, filter `doc.tables` (returning a clear out-of-range error when `tableIndex >= doc.tables.length`), and preserve `UNTRUSTED_DOCUMENT_CONTENT` framing and guard findings; update `handleSearchDocuments` to pass `totalChars` and `tableCount` to `frameSearchHit`.
- [x] 2.2 Update `get_document` audit logging in `packages/mcp-server/src/server.ts` to record defined pagination/table arguments (`offset`, `maxChars`, `tableIndex`, `includeTables`) without logging document content; add `node:test` cases in `packages/mcp-server/src/mcp-server.test.ts` covering `get_document` backward compatibility, `offset` + `maxChars` pagination, `tableIndex` selection, `includeTables: false`, out-of-range `tableIndex`, and `search_documents` size metadata, then run `pnpm test` to verify all tests pass.

## 3. Documentation & Roadmap (`README.md`, `packages/cli/README.md`, `docs/ROADMAP.md`)

- [x] 3.1 Document the new `get_document` pagination and table-filtering parameters (`offset`, `maxChars`, `tableIndex`, `includeTables`) in `README.md` and `packages/cli/README.md`, mark `add-mcp-document-pagination` as `✅ done` in `docs/ROADMAP.md`, and verify `pnpm test` passes cleanly.
