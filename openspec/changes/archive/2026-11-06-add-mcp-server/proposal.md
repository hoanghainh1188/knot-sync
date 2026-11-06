# Proposal

## Why

KnotSync already scans, extracts, cleans, masks PII, and guards documents in a
local store, but agents still cannot reach that data. v0.1 needs a read-only
stdio MCP server so Claude Desktop / Claude Code / Cursor can search and fetch
documents safely, with content framed as untrusted data and audit logging.

## What Changes

- New package `packages/mcp-server` (`@hoanghainh/knot-sync-mcp-server`) that
  hosts an MCP server over **stdio only**.
- CLI command `knot-sync serve` starts that server against the configured store
  (no longer “coming soon”).
- **Resources:** `knot://sources`, `knot://docs/{source}/{doc_id}`.
- **Tools** (strict Zod input schemas): `search_documents` (query, source,
  type, limit), `get_document` (id). Built-ins register as `mcp-tool` plugins.
- **Prompts** loaded from config `prompts:` (name, description, arguments,
  template); also exposed via `mcp-prompt` registrations where applicable.
- Every tool/resource result that returns document text SHALL frame it as
  untrusted document content (never as instructions) and SHALL include guard
  flags / risk summary when present on the document.
- **Audit log** as JSONL at config `server.audit_log` (timestamp, tool or
  resource, arguments, result count). Default path under the store directory
  when omitted.
- **Read-only:** no MCP tool or resource may create, modify, move, or delete
  anything in sources or mutate the store.
- README section: how to register the server in Claude Desktop, Claude Code,
  and Cursor.
- New third-party dependencies (both MIT): `@modelcontextprotocol/sdk`, `zod`.

### Out of scope

- HTTP transport and OAuth 2.1 (paid edition).
- Write tools / store mutations via MCP (after v1.0, with human approval).
- SQL resources/tools (`add-sql-source`), Semantic Catalog-driven tool
  descriptions (`add-semantic-catalog`).
- Vector / embedding search; resource subscriptions (v0.3).
- Shipping a separate long-running daemon manager (systemd, etc.).

## Capabilities

### New Capabilities

- `mcp-server`: stdio MCP surface (resources, tools, prompts), untrusted-content
  framing, guard flags in results, JSONL audit log, and `serve` CLI wiring.

### Modified Capabilities

- `config`: optional `server:` (audit log path and related) and `prompts:` list.
- `plugin-system`: `McpTool` / `McpPrompt` become executable contracts (not stubs).
- `scan-report`: `serve` is available (remove “not available yet” requirement for it).
- `document-search`: optional filters for source id and document type on search,
  and explicit limit capped as today (≤100), so MCP tools can pass them through.

## Impact

- **Code:** `mcp-server` package; CLI `serve`; core plugin types for MCP; config
  loader for `server` / `prompts`; store search filters if not already present;
  README client registration snippets.
- **Deps:** `@modelcontextprotocol/sdk` (MIT), `zod` (MIT) — listed for the
  mcp-server (and possibly CLI) package only.
- **Docs:** README (`serve`, MCP clients), `docs/ROADMAP.md` mark change done
  when archived.
