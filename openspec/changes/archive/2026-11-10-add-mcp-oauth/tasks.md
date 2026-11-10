# Tasks

## 1. Package skeleton and license

- [x] 1.1 Create `packages/auth-oauth` (private, plugin default export,
      `apiVersion` compatible) with settings parser + license self-check —
      verify unknown settings keys fail; missing license leaves OAuth unusable;
      `knot-sync plugins` lists `auth-oauth` only when `plugins:` includes it
- [x] 1.2 Wire workspace/tsconfig references and README (license env,
      local AS vs JWKS, API-key fallback) — verify package builds under
      `pnpm test` scope

## 2. MCP auth extension hook

- [x] 2.1 Add mcp-auth provider registration on the plugin API (or equivalent
      narrow hook) and wire `serveHttp` / tool+resource paths to call it when
      present — verify free path still API-key-only with no oauth package
      loaded; unit tests for 401 without credentials
- [x] 2.2 Enforce `authorizeTool` / `authorizeResource` for OAuth sessions;
      API-key fallback grants full tool+resource access — verify denied
      `query_table` returns no cell bodies; Japanese `knot://` resource denied
      without scope

## 3. Local AS and JWKS

- [x] 3.1 Implement local token issuance + JWT validation (env secrets only;
      prefer `node:crypto`, add **jose** MIT only if needed) and token HTTP
      path — verify client-credentials (or documented grant) issues a token
      accepted by HTTP MCP; no outbound IdP call in default mode
- [x] 3.2 Implement optional JWKS validation (fetch+cache, fail closed) —
      verify mocked JWKS accepts valid JWT and rejects bad signature; missing
      JWKS fetch soft-fails to 401 with actionable message
- [x] 3.3 Keep `KNOT_SYNC_API_KEY` fallback when plugin loaded — verify shared
      Bearer still authorizes; audit lines include subject/scopes and never raw
      tokens/secrets

## 4. Docs and roadmap

- [x] 4.1 Update starter comments / README / Paid #4 in `docs/ROADMAP.md`;
      document scope vocabulary (`tool:` / `resource:`) and env examples; run
      full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-mcp-oauth` after apply review
- Commit / PR when Harry asks
