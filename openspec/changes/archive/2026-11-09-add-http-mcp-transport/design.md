# Design

## Context

See proposal.md — Why. Today `serveStdio` connects `McpServer` to
`StdioServerTransport` only; specs forbid listeners. Audit entries are
`{ timestamp, kind, name, arguments?, uri?, resultCount, status, error? }`.
Config `server:` allows only `audit_log` (a test already rejects `port`).

Product “fully local / no network” means: no outbound telemetry/CDN; stdio
default stays offline. Optional `--http` is an **inbound** operator-enabled
listener for team deploy (open-core v0.3), still read-only against sources.

SDK `@modelcontextprotocol/sdk@1.32` marks `SSEServerTransport` deprecated in
favor of `StreamableHTTPServerTransport`. ROADMAP text said SSE; we implement
Streamable HTTP as the HTTP mode (protocol-current). Legacy SSE dual-stack is
out of scope unless a follow-up needs it.

## Goals / Non-Goals

**Goals:**

- CLI `--http` / `--port` / `--host` with safe loopback default.
- Env-only Bearer API key; 401 otherwise; fail-fast if env missing in HTTP mode.
- Audit enrichment for HTTP requests.
- Stdio path unchanged for Desktop/Cursor local configs.

**Non-Goals:**

- OAuth, TLS in-process, multi-tenant ACLs.
- Putting port/api_key into YAML `server:`.
- Implementing deprecated SSE endpoints in v1 of this change.
- Adding Express unless `node:http` proves insufficient (prefer no new deps).

## Decisions

### 1. Transport: Streamable HTTP, not deprecated SSE

- **Choice:** `StreamableHTTPServerTransport` from the existing SDK.
- **Why:** Current MCP protocol; SSE class is `@deprecated` in 1.32.x.
- **Alternatives:** SSE-only (matches outdated ROADMAP wording) — rejected for
  forward compatibility. Dual SSE+Streamable — deferred (scope).

### 2. HTTP stack: Node `http` first

- **Choice:** `node:http.createServer` + SDK transport request handlers.
- **Why:** Avoid new dependency; matches “built-ins first”.
- **Fallback:** If SDK helpers require Express/`createMcpExpressApp`, add
  `express` (MIT) as an explicit dependency in tasks before coding — do not
  sneak it in.

### 3. Flags and defaults

| Flag | Default | Notes |
|---|---|---|
| `--http` | off | Enables HTTP mode (exclusive with stdio MCP for that process) |
| `--port` | `3000` | Positive integer |
| `--host` | `127.0.0.1` | Override e.g. `0.0.0.0` for LAN behind firewall |

One process = one transport mode (either stdio or HTTP), not both.

### 4. Auth

- Read `process.env.KNOT_SYNC_API_KEY`; require non-empty before `listen`.
- Middleware: parse `Authorization: Bearer <token>`; compare with
  `crypto.timingSafeEqual` on equal-length buffers (reject length mismatch
  without leaking).
- Do not log the raw key; audit may record auth denial as error status only.

### 5. Session / server lifecycle

- Create `McpServer` via existing `createKnotMcpServer`.
- Follow SDK Streamable HTTP session connect/close patterns; shut down on
  SIGINT/SIGTERM.
- DNS rebinding: when host is loopback, enable Host allowlist
  (`127.0.0.1` / `localhost`); when binding `0.0.0.0`, document that operators
  must put a reverse proxy / firewall in front.

### 6. Audit enrichment

Extend `AuditEntry` with optional:

```ts
clientIp?: string;
userAgent?: string;
requestId?: string;
```

Generate `requestId` (UUID) per HTTP request; pass through handler context.
Stdio mode omits these fields (backward compatible JSONL).

### 7. Request path

Document a single MCP HTTP path (e.g. `/mcp`) matching SDK Streamable HTTP
conventions; put it in README so clients can configure Cursor/Claude HTTP MCP.

## Risks / Trade-offs

- **[Risk]** Binding `0.0.0.0` without TLS exposes the API key surface →
  Mitigation: loopback default; docs warn; reverse proxy for production.
- **[Risk]** Streamable HTTP session state in memory → Mitigation: single-node
  only; document restart drops sessions.
- **[Risk]** ROADMAP said SSE → Mitigation: README notes Streamable HTTP
  supersedes deprecated SSE; same product goal (networked MCP).
- **[Risk]** Express peer of SDK unused → Mitigation: prefer `node:http`; only
  add express if blocked.

## Migration Plan

- Existing `knot-sync serve` configs unchanged (stdio).
- Operators enable HTTP with flags + env key.
- Rollback: omit `--http`.

## Open Questions

- None blocking; Express fallback decided only if `node:http` integration fails
  during apply.
