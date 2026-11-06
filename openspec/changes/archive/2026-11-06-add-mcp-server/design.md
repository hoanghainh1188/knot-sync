# Design: add-mcp-server

## Context

Store + search already exist (`store-sqlite.search`, `getDocument`). CLI `serve`
is stubbed (exit 2). Plugin host has stub `McpTool` / `McpPrompt`. See
proposal.md for motivation.

Constraints that shape this design: read-only sources, fully local (stdio only,
no outbound network), document text untrusted, MIT/Apache-compatible deps only,
MCP tools/prompts as plugins.

## Goals / Non-Goals

**Goals**

- Stdio MCP server package + `knot-sync serve`.
- Resources `knot://sources` and `knot://docs/{source}/{doc_id}`.
- Tools `search_documents` / `get_document` with Zod schemas; config prompts;
  JSONL audit; untrusted framing + guard flags.
- Executable `mcp-tool` / `mcp-prompt` registries; search filters for source/type.

**Non-Goals**

- HTTP/OAuth; write tools; SQL MCP; catalog-driven schemas; resource
  subscriptions; embedding search.

## Decisions

### 1. Package layout and dependencies

New workspace package `packages/mcp-server`
(`@hoanghainh/knot-sync-mcp-server`):

- Depends on: `@modelcontextprotocol/sdk` (MIT), `zod` (MIT),
  `@hoanghainh/knot-sync-core`, `@hoanghainh/knot-sync-store-sqlite`.
- Exports: `createMcpServer({ store, config, host, audit })` (or equivalent)
  returning a startable stdio server; helpers to register built-in tools as a
  plugin; `frameUntrusted(documentText)` framing helper.

CLI depends on `mcp-server` and calls it from `cmdServe`. Keep `bin.ts`
EPIPE/SQLite-warning behavior unchanged (stdio MCP shares stdout carefully —
MCP SDK owns the stdio transport; CLI MUST NOT write normal user progress to
stdout while serving).

**Alternative:** put MCP handlers inside `packages/cli`. Rejected — keeps the
CLI thin and matches other pipeline packages; paid HTTP transport can later
share the same package surface.

### 2. Read-only and fully-local guarantees

- Transport: MCP SDK **stdio** only. No `createServer` HTTP, no bind, no fetch.
- Store: open SQLite as today for reads; tool/resource handlers call only
  `search` / `getDocument` / config metadata — never `upsert`, `replaceInventory`,
  or filesystem writes under sources.
- Audit log: append-only JSONL at `server.audit_log` (resolved like other
  paths). Refuse paths inside any configured source (same idea as HTML report).
- No telemetry. Framing text is static English (i18n later).

### 3. URI and tool shapes

| Surface | Shape |
|---|---|
| Resource | `knot://sources` → JSON list `{ id, type }[]` |
| Resource | `knot://docs/{source}/{doc_id}` → framed document; 404 if missing or source mismatch |
| Tool | `search_documents` `{ query, source?, type?, limit? }` |
| Tool | `get_document` `{ id }` |

`doc_id` in the URI is URL-encoded document id (ids may contain path-like
segments from hashing). Document id remains the store’s existing stable id.

**Framing:** wrap body/snippet/title sections with a clear delimiter block, e.g.
a leading line `UNTRUSTED_DOCUMENT_CONTENT` / instruction that the following is
data only, plus structured fields `guardRisk` / `guard` findings when present
(`metadata.guardRisk` + `Document.guard`).

### 4. Plugin contracts

Widen stubs:

```ts
export interface McpTool {
  id: string;
  description: string;
  inputSchema: ZodTypeAny; // or JSON Schema object — prefer Zod, convert for MCP
  handler(args: unknown, ctx: McpHandlerContext): Promise<McpToolResult>;
}

export interface McpPrompt {
  id: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  template: string;
}
```

Built-in plugin (from `mcp-server` or CLI builtins) registers
`search_documents` and `get_document`. Config `prompts:` are loaded by the
server (not necessarily as plugins) and merged into the MCP prompts list;
duplicate names between config and plugins fail at startup with a clear error.

**Alternative:** only config prompts, no plugin prompts. Rejected — roadmap
requires `mcp-prompt` extension point to be real for paid/custom prompts later.

### 5. Search filters

Extend `Store.search(query, options?: { limit?; sourceId?; type? })` (keep
backward-compatible overload or options object). AND semantics unchanged;
filters applied in SQL `WHERE` after FTS/LIKE match. Cap limit at 100.

### 6. Config

```yaml
server:
  audit_log: .data/mcp-audit.jsonl   # optional; default beside store
prompts:
  - name: find-invoice
    description: Find invoice-like documents
    arguments:
      - name: query
        description: Search terms
        required: true
    template: |
      Search KnotSync for invoices matching: {{query}}
```

Add `ServerConfig` and `PromptConfig[]` to `AppConfig`. Extend reserved-key
list: `server`, `prompts` are first-class (not opaque plugin settings).

### 7. Testing strategy

- Unit tests in `mcp-server`: framing, URI parse, audit line shape, tool
  handlers against an in-memory/temp store with JP/VN fixtures (reuse pattern
  from store tests).
- CLI tests: `serve` no longer returns “not available yet”; with a fake/mocked
  transport or short-lived child if needed — prefer testing server factory
  directly from the package and a thin CLI smoke that wiring resolves.
- Do not require a live Claude Desktop session in CI.

### 8. Client registration docs

README section with copy-paste snippets for Claude Desktop
(`claude_desktop_config.json`), Claude Code / Cursor MCP config pointing at
`npx @hoanghainh/knot-sync serve -c /path/to/knot-sync.config.yaml` (or the
local `knot-sync` bin). Emphasize stdio and local-only.

## Risks / Trade-offs

- **[Risk] Stdio conflict** — CLI accidentally writes to stdout → Mitigation:
  `serve` routes human errors to stderr only; MCP SDK owns stdout.
- **[Risk] SDK churn** — MCP SDK API changes → Mitigation: pin a known MIT
  version; thin adapter module around Server/transport.
- **[Risk] Large document bodies in MCP** — token blowups → Mitigation: search
  returns snippets; `get_document` returns full content as stored (already
  cleaned/PII-masked); document size limits deferred.
- **[Risk] Audit path misuse under source** → Mitigation: refuse like `--report`.

## Migration Plan

- No store schema migration required for MCP itself (search filter is query-side).
- Existing configs without `server`/`prompts` keep working with defaults.
- Rollback: revert package + CLI; `serve` stub returns if needed.

## Open Questions

None blocking; exact MCP SDK minor version chosen at apply time from current
npm MIT release compatible with Node ≥ 22.13.
