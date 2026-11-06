# Tasks

## 1. Config, store filters, plugin contracts

- [x] 1.1 Add `ServerConfig` / prompt types and parse optional `server:` + `prompts:` in core config; extend reserved keys; verify with `pnpm test` (config unit tests for defaults, unknown keys, duplicate prompt names)
- [x] 1.2 Extend `Store.search` with optional `sourceId` / `type` filters (limit still capped at 100); verify with `pnpm test` (JP query + source filter)
- [x] 1.3 Widen core `McpTool` / `McpPrompt` from stubs to the executable contracts in design.md; verify with `pnpm test` (plugin host registration)

## 2. mcp-server package

- [x] 2.1 Create `packages/mcp-server` (`@hoanghainh/knot-sync-mcp-server`) with workspace wiring; add deps `@modelcontextprotocol/sdk` (MIT) and `zod` (MIT) only as listed in the proposal
- [x] 2.2 Implement untrusted-content framing helper, URI helpers (`knot://sources`, `knot://docs/...`), and JSONL audit writer (refuse paths under sources); verify with `pnpm test`
- [x] 2.3 Implement built-in `search_documents` and `get_document` handlers + MCP tool plugin registration (Zod schemas); verify with `pnpm test` against a temp store (JP/VN fixtures, guard flags in result)
- [x] 2.4 Wire stdio MCP server factory (resources, tools, config prompts merged); verify with `pnpm test` (resource/tool behavior without binding a network port)

## 3. CLI `serve` and docs

- [x] 3.1 Implement `knot-sync serve` (load config/plugins/store, start mcp-server on stdio, stderr-only diagnostics); remove “coming soon” / not-available path; verify with `pnpm test`
- [x] 3.2 Update README.md (serve, MCP client registration for Claude Desktop / Claude Code / Cursor) and mark `add-mcp-server` done in `docs/ROADMAP.md`
- [x] 3.3 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-mcp-server` after review.
