# Spec Delta

## Purpose

Provides opt-in, licensed OAuth 2.1-style authentication for HTTP MCP so team
deployments can identify clients and enforce tool/resource scopes, with a local
token issuer by default and optional on-prem JWKS validation—while keeping the
shared API key as a fallback.

## ADDED Requirements

### Requirement: Opt-in mcp-oauth plugin

The system SHALL provide an auth plugin (not loaded as a default built-in) that
operators enable by listing it under config `plugins:`. When loaded and
licensed, HTTP MCP SHALL accept OAuth bearer access tokens in addition to the
shared API key fallback. Stdio serve SHALL remain unaffected.

#### Scenario: Plugin omitted keeps API-key-only HTTP

- **GIVEN** config does not list the mcp-oauth plugin
- **WHEN** the user runs `knot-sync serve --http` with `KNOT_SYNC_API_KEY` set
- **THEN** HTTP auth behaves as today (shared Bearer API key only)
- **AND** OAuth token issuance endpoints from this plugin are not exposed

#### Scenario: Licensed plugin enables OAuth bearer acceptance

- **GIVEN** the mcp-oauth plugin is listed with a valid license and local AS
  configured
- **WHEN** an HTTP MCP client presents a valid access token as
  `Authorization: Bearer …`
- **THEN** the request proceeds to MCP handling subject to scopes
- **AND** source files under configured roots remain unchanged

### Requirement: License self-check

The mcp-oauth plugin SHALL validate its own license (environment variable
and/or plugin settings) before enabling OAuth auth or token issuance. The
KnotSync core SHALL NOT implement that check. Invalid or missing license SHALL
fail load or leave OAuth unusable with guidance to set the documented license
env/key.

#### Scenario: Missing license blocks OAuth features

- **GIVEN** the plugin path is listed but no valid license is configured
- **WHEN** plugins load or HTTP serve would enable OAuth
- **THEN** OAuth auth/issuance is not usable
- **AND** the message names how to set the license

### Requirement: Local authorization server by default

When OAuth is enabled without an external JWKS configuration, the plugin SHALL
issue and validate access tokens locally (no outbound IdP HTTP calls for the
default path). Operators SHALL supply signing material via environment
variables (never plaintext secrets in YAML). Token responses MUST NOT be
written into customer source folders.

#### Scenario: Issue token for registered client

- **GIVEN** a licensed local AS with a registered client id/secret from env
- **WHEN** the client requests a token with the documented grant
- **THEN** an access token is returned that HTTP MCP accepts as Bearer
- **AND** no network call is made to an external identity provider

### Requirement: Optional on-prem JWKS validation

Operators MAY configure JWT validation against an on-prem IdP JWKS URL. When
configured, the plugin MAY fetch and cache JWKS from that URL only. Cloud-only
IdP as the sole auth path is not required. Failures to fetch/validate SHALL
return 401 without document bodies.

#### Scenario: Valid JWKS-backed token accepted

- **GIVEN** JWKS URL is configured for an on-prem IdP and the plugin is licensed
- **WHEN** a client presents a Bearer JWT signed by a key in that JWKS
- **THEN** HTTP MCP accepts the request subject to scopes in the token
- **AND** audit records the subject without logging the raw token

### Requirement: Shared API key remains a fallback

When the mcp-oauth plugin is loaded and licensed, a request with
`Authorization: Bearer` matching `KNOT_SYNC_API_KEY` SHALL still be authorized
(documented as full/ops access). Missing/invalid OAuth token and missing/wrong
API key SHALL yield **401**. Open-core MUST keep API-key-only behavior when the
plugin is omitted.

#### Scenario: API key still works with plugin loaded

- **GIVEN** oauth plugin loaded and `KNOT_SYNC_API_KEY` set
- **WHEN** a client calls HTTP MCP with the shared API key Bearer
- **THEN** the request is authorized without requiring an OAuth access token

### Requirement: Tool and resource scopes

Access tokens SHALL carry scopes that authorize MCP **tools** and **resources**.
Calls to tools or resource reads outside the granted scopes SHALL be denied
(403 or MCP error) without returning document/SQL bodies. Scope vocabulary and
wildcards SHALL be documented (e.g. per-tool ids and resource URI patterns).

#### Scenario: Scoped tool denied

- **GIVEN** a token scoped only to `search_documents`
- **WHEN** the client invokes `query_table`
- **THEN** the call is denied
- **AND** no table cell values are returned

#### Scenario: Japanese resource URI requires matching scope

- **GIVEN** a stored document under a Japanese path/title such as `経理/請求書`
- **AND** a token lacking resource read scope for that document URI
- **WHEN** the client requests that resource over HTTP MCP
- **THEN** the read is denied
- **AND** document content is not returned

### Requirement: Audit without secrets

OAuth-authenticated HTTP MCP activity SHALL append audit JSONL entries that MAY
include subject/client id and scope summary. Entries MUST NOT include access
tokens, refresh tokens, client secrets, API keys, or document/SQL bodies.

#### Scenario: Audit omits bearer token

- **WHEN** an OAuth-authenticated `search_documents` succeeds
- **THEN** the audit line records tool name and subject/client identity
- **AND** does not contain the Bearer token string
