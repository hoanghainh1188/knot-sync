# Spec Delta

## ADDED Requirements

### Requirement: HTTP auth may use OAuth when plugin loaded

When the mcp-oauth plugin is loaded and licensed, HTTP MCP endpoints SHALL
accept either a valid OAuth access token or the shared `KNOT_SYNC_API_KEY`
Bearer as authentication. When the plugin is not loaded, behavior remains
API-key-only as today. Unauthorized requests SHALL return **401** and MUST NOT
execute tools or return document bodies.

#### Scenario: OAuth bearer accepted alongside API key path

- **GIVEN** mcp-oauth is loaded and a valid access token is presented
- **WHEN** the client calls an HTTP MCP endpoint
- **THEN** authentication succeeds
- **AND** further authorization follows tool/resource scopes

### Requirement: Enforce tool and resource scopes on HTTP MCP

For OAuth-authenticated sessions, the MCP server SHALL enforce granted scopes
before running tools or serving resources. Denied calls SHALL NOT return
untrusted document/SQL payloads. API-key fallback sessions MAY skip fine-grained
scopes (documented full access).

#### Scenario: Resource denied without scope

- **GIVEN** an OAuth session without resource-read scope
- **WHEN** the client requests a document resource
- **THEN** the server denies the read
- **AND** does not return framed document content
