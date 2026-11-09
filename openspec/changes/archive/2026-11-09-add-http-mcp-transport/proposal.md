# Proposal

## Why

`knot-sync serve` is stdio-only today, so a shared KnotSync instance cannot sit
on a team LAN or reverse-proxy for multiple MCP clients. v0.3 open-core needs
optional HTTP MCP transport with a shared API key so JP/VN enterprise teams can
run one read-only server without paid OAuth.

## What Changes

- Add `knot-sync serve --http [--port 3000] [--host …]` alongside existing
  stdio (default remains stdio when `--http` is omitted).
- Serve MCP over HTTP using `@modelcontextprotocol/sdk` **Streamable HTTP**
  transport (current protocol). Document that legacy SSE transport is deprecated
  in the SDK; do not require Express if Node `http` suffices.
- Require Bearer API key auth from env `KNOT_SYNC_API_KEY` for all HTTP MCP
  routes; missing/invalid credentials → **401 Unauthorized**. Never store the
  key in the YAML config file.
- Enrich JSONL audit entries (HTTP mode) with client IP, User-Agent, and a
  request/correlation id.
- Keep tools/resources/prompts read-only and untrusted-content framing unchanged.
- Update README / ja-vi docs / roadmap; add CLI locale strings for new flags and
  errors.

Out of scope:

- **OAuth 2.1, scopes, multi-tenant identity** (paid).
- TLS termination inside KnotSync (operators use reverse proxy / local TLS).
- Changing tool/resource contracts, catalog, PII, or SQL query semantics.
- Other v0.3 items: `enhance-pii-guard`, `scale-sqlite-store`, system logs.
- Outbound telemetry or CDN assets.

New third-party dependencies: **none preferred** (reuse existing
`@modelcontextprotocol/sdk` MIT + Node `node:http`). If implementation must
pull `express` (MIT) as a peer of the SDK for `createMcpExpressApp`, list it
explicitly in design/tasks before adding.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `mcp-server`: optional HTTP/Streamable HTTP transport; API key auth; enriched
  audit fields; relax “stdio only / no listeners” for `--http` while stdio
  default stays offline.
- `config`: document env `KNOT_SYNC_API_KEY` for HTTP serve (no plaintext key in
  YAML); optional `server` keys only if design needs bind defaults beyond flags.

## Impact

- `packages/mcp-server` (HTTP listener, auth middleware, audit fields)
- `packages/cli` (`serve` flags, i18n messages, help)
- `packages/core` only if `server:` config keys expand
- Tests (HTTP auth 401/200, audit enrichment, stdio regression)
- README / `docs/ROADMAP.md` / docs ja-vi as needed
