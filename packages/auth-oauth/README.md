# @hoanghainh/knot-sync-auth-oauth

Opt-in **paid** OAuth 2.1-style authentication for KnotSync HTTP MCP:

- **Default:** local Authorization Server (client credentials → HS256 JWT)
- **Optional:** validate JWTs against an on-prem IdP **JWKS** URL
- **Fallback:** shared `KNOT_SYNC_API_KEY` still grants full `tool:*` + `resource:*`
- **Scopes:** `tool:<id>` / `tool:*` and `resource:<pattern>` / `resource:*`

Not a free CLI built-in. Enable under `plugins:` and set a license.

## License

```bash
export KNOT_SYNC_OAUTH_LICENSE=your-license-key
```

Test sentinel: `knot-sync-oauth-dev`.

## Config

```yaml
plugins:
  - ../packages/auth-oauth/dist/index.js   # monorepo path example
auth-oauth:
  # licenseEnv: KNOT_SYNC_OAUTH_LICENSE
  # licenseKey: knot-sync-oauth-dev   # tests / local only
  # issuer: knot-sync-local
  # audience: knot-sync-mcp
  # tokenPath: /oauth/token
  # jwksUrl: https://keycloak.internal/realms/app/protocol/openid-connect/certs
  # defaultScopes: [tool:*, resource:*]
```

### Local AS env

```bash
export KNOT_SYNC_OAUTH_SIGNING_SECRET='long-random-secret'
export KNOT_SYNC_OAUTH_CLIENT_ID='agent-a'
export KNOT_SYNC_OAUTH_CLIENT_SECRET='agent-secret'
# optional ops escape hatch:
export KNOT_SYNC_API_KEY='shared-ops-key'
```

Token request:

```bash
curl -sS -X POST 'http://127.0.0.1:3000/oauth/token' \
  -d 'grant_type=client_credentials' \
  -d 'client_id=agent-a' \
  -d 'client_secret=agent-secret' \
  -d 'scope=tool:search_documents resource:knot://docs/*'
```

Then call MCP with `Authorization: Bearer <access_token>`.

### Scope vocabulary

| Scope | Meaning |
| --- | --- |
| `tool:search_documents` | Invoke that MCP tool |
| `tool:*` | All tools |
| `resource:knot://docs/*` | Document resources under that prefix |
| `resource:*` | All resources |

## JWKS mode

Set `auth-oauth.jwksUrl` to an on-prem IdP JWKS endpoint. Local `/oauth/token`
issuance is disabled in that mode—clients obtain tokens from the IdP. This is
the only intentional outbound network call for this plugin (cached JWKS fetch).

## Dependency

- `jose` (MIT) — JWT sign/verify and JWKS
