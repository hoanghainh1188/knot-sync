# Proposal

## Why

Open-core HTTP MCP only supports a **shared** `KNOT_SYNC_API_KEY` Bearer
secret—fine for a single operator, weak for teams. Paid roadmap **OAuth 2.1 +
scopes** adds real client identity and per-client authorization for tools and
resources while keeping stdio and the shared API key as a documented fallback.

## What Changes

- Add an **opt-in paid plugin** package (private workspace) that provides OAuth
  2.1-style HTTP MCP auth with **scopes** over tools and resources
- **Default mode:** embedded local Authorization Server (issue/validate JWTs
  with Node built-ins / approved pure-JS crypto)—no outbound IdP calls
- **Opt-in mode:** validate JWTs against an on-prem IdP via JWKS (explicit
  network to that IdP only; documented exception to “no network” for this
  paid auth path)
- **`KNOT_SYNC_API_KEY` remains a fallback** when the plugin is loaded: valid
  shared key still authorizes (full access for ops); missing both OAuth token
  and API key → 401
- Scope model covers **MCP tools and resources** (not prompts in v1 unless
  cheap); unauthorized tool/resource calls return 403/MCP error without
  document bodies
- Plugin **self-checks** a license key; core never validates licenses; **not**
  a free CLI built-in
- Audit JSONL records client/subject id and granted scopes (never raw tokens)
- Update README / Paid #4 in `docs/ROADMAP.md`

**Assumptions (from Harry):**

1. **C** — local AS default + optional external JWKS IdP  
2. Shared API key stays as **fallback**  
3. Scopes for **tools + resources**  
4. Ship as **private opt-in plugin** with license self-check  

## Capabilities

### New Capabilities

- `mcp-oauth`: paid OAuth 2.1-style auth for HTTP MCP—local token issuance
  and/or JWKS validation, tool/resource scopes, license gate, API-key fallback

### Modified Capabilities

- `mcp-server`: HTTP auth path MAY accept OAuth bearer tokens (when plugin
  loaded) in addition to the shared API key; enforce scopes on tools/resources
- `plugin-system`: document mcp-oauth as opt-in paid auth (not a default
  built-in); optional auth-related extension registration
- `config` (light): starter/docs for `plugins:` + oauth plugin settings
  (local AS secrets via env, optional JWKS URL, scope maps)

## Impact

- Code: new `packages/auth-oauth` (npm `@hoanghainh/knot-sync-auth-oauth`,
  name finalized at design); small hooks in `packages/mcp-server` /
  CLI `serve --http` so free path stays API-key-only without pulling oauth deps
- Dependencies (pin at design/apply): prefer `node:crypto`; if a JWT helper is
  needed, **jose** (MIT) or equivalent MIT/BSD/Apache/ISC only—**no GPL/AGPL**,
  no native deps on the free CLI publish path
- Ops: operators enable via `plugins:` + license env; optional on-prem JWKS URL
- Product: stdio unchanged; free HTTP+API key unchanged when plugin omitted;
  still read-only to sources; no telemetry

## Out of scope

- Replacing or removing `KNOT_SYNC_API_KEY` from open-core
- Cloud-only IdP as the sole path; social login; browser SSO UX beyond
  documented client-credentials / JWT bearer for MCP clients
- Source-level / tenant row ACLs beyond tool+resource scopes (later)
- Prompt-level scopes (v1 focuses tools + resources)
- OAuth for stdio transport
- Vector search, local LLM catalog, model-based guardrails
- Making oauth a default built-in of the free published CLI
