# Spec Delta

## ADDED Requirements

### Requirement: search_similar MCP tool when vector plugin loaded

When the search-vector plugin is loaded and licensed, the MCP server SHALL
expose a `search_similar` tool that returns semantically similar cleaned
documents with scores. When the plugin is absent, that tool SHALL NOT be
registered. Hit payloads MUST keep untrusted-content framing; no source writes.

#### Scenario: search_similar returns Vietnamese-related hit

- **GIVEN** search-vector is loaded and a document about `hóa đơn` is embedded
- **WHEN** an MCP client calls `search_similar` with a related Vietnamese query
- **THEN** the response includes that document among hits
- **AND** content is framed as untrusted data

#### Scenario: Tool absent without plugin

- **GIVEN** search-vector is not listed under `plugins:`
- **WHEN** the MCP server starts
- **THEN** `search_similar` is not registered
- **AND** `search_documents` remains available
