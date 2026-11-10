# Design

## Context

See proposal.md — Why. Open-core `serve --http` authenticates solely via
`KNOT_SYNC_API_KEY` (`packages/mcp-server` `checkBearerAuth` + `serveHttp`).
Paid OCR/housen/SQL established: private package, license self-check, opt-in
`plugins:`. Product constraints: read-only sources, no telemetry; “no network
at runtime” remains the default—JWKS fetch is an **explicit opt-in** for
on-prem IdP only.

## Goals / Non-Goals

**Goals:**

- Opt-in OAuth bearer auth for HTTP MCP with tool + resource scopes
- Local AS default (issue/validate JWT without outbound IdP)
- Optional JWKS validation for on-prem IdP
- Keep shared API key as full-access fallback
- Free CLI publish path stays free of oauth deps / native crypto packages

**Non-Goals:**

- Browser SSO / social login UX
- Removing API key from open-core
- Source-row ACLs / multi-tenant data partitioning beyond scopes
- OAuth on stdio
- Prompt-level scopes in v1

## Decisions

### 1. Package layout

**Choice:** `packages/auth-oauth`, npm `@hoanghainh/knot-sync-auth-oauth`,
`"private": true`. Plugin name `auth-oauth`; settings key `auth-oauth:`.

**Alternatives:** Fold into `mcp-server` — rejected (forces paid deps into free
path). Name `mcp-oauth` package — acceptable alias in docs; keep npm
`auth-oauth` for clarity beside `mcp-server`.

### 2. Extension hook (free ↔ paid)

**Choice:** Add a narrow **mcp-auth** extension point (or
`registerMcpAuthProvider`) on the plugin API:

- `authenticate(authorizationHeader) → { ok, subject?, scopes?, via: "oauth"|"apiKey" } | { ok: false }`
- `authorizeTool(toolId, auth) → boolean`
- `authorizeResource(uri, auth) → boolean`

`serveHttp` / MCP handlers call the registered provider when present; otherwise
keep today’s API-key-only path. Core does not implement OAuth—only the hook.

**Alternatives:** CLI special-cases the package name — rejected (brittle).
Duplicate HTTP server in paid package — rejected (drift).

### 3. Local AS

**Choice:** Client-credentials-style token endpoint on a dedicated path (e.g.
`/oauth/token`) served only when plugin enabled; JWT access tokens (HS256 or
EdDSA via `node:crypto` and/or **jose** MIT). Clients + signing secret from env
(`KNOT_SYNC_OAUTH_*`). Short TTL; no refresh tokens in v1 unless trivial.

**Alternatives:** Opaque tokens in SQLite — more state; defer. Full OIDC
discovery — out of scope for MCP agent clients.

### 4. Scope vocabulary

**Choice:**

| Scope | Meaning |
| --- | --- |
| `tool:<id>` | Invoke MCP tool `id` |
| `tool:*` | All tools |
| `resource:<pattern>` | Read resources matching pattern (prefix/`*` documented) |
| `resource:*` | All resources |

API-key fallback ⇒ implicit `tool:*` + `resource:*`. Document mapping for
built-in tools (`search_documents`, `get_document`, `describe_table`,
`query_table`, …) and `knot://…` resources.

### 5. JWKS opt-in

**Choice:** Settings `jwksUrl` (http/https to on-prem IdP). Fetch + cache JWKS;
validate `iss`/`aud`/`exp` per settings. If unset, local AS only—**zero**
outbound calls. Document that JWKS mode is the sole intentional network
exception for this plugin.

### 6. License

**Choice:** `KNOT_SYNC_OAUTH_LICENSE` / settings `licenseKey`; test sentinel
`knot-sync-oauth-dev`. Missing → OAuth features unusable; API-key-only still
works if env key set (fallback must not depend on oauth license).

### 7. Dependencies

**Choice:** Prefer `node:crypto`. If JWT ergonomics need a library, add **jose**
(MIT) only on the private package. No native deps. List in proposal/tasks.

## Risks / Trade-offs

- **[JWKS vs “no network”]** → default local AS; JWKS documented opt-in only;
  cache + timeouts; fail closed
- **[Scope bypass via API key]** → intentional ops escape hatch; document
  rotation and prefer OAuth for agents
- **[Hook surface growth]** → keep auth provider interface minimal; no
  free-form middleware
- **[Token endpoint exposure]** → bind with same host/port rules as MCP; still
  require client secret; loopback default

## Migration Plan

- No store schema change
- Existing API-key HTTP clients keep working with or without plugin
- Rollback: remove `plugins:` entry

## Open Questions

None blocking—exact JWT alg, token path, and jose version pinned at apply.
