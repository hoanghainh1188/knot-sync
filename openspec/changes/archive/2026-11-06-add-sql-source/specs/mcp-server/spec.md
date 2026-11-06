# Spec: mcp-server (delta)

## ADDED Requirements

### Requirement: SQL schema resource and query tools

When SQL sources are configured and the SQL connector plugin is loaded, the MCP
server SHALL expose `knot://db/{source}/{table}/schema` and register tools
`describe_table` and `query_table` as specified by the sql-query capability.
These surfaces MUST remain read-only and MUST apply untrusted-content framing to
row payloads. When no SQL source is configured, the tools MAY still be
registered but SHALL fail clearly if invoked for a missing/non-SQL source.

#### Scenario: Tools listed with SQL plugin

- **WHEN** the user runs `knot-sync plugins` with default plugins including SQL
- **THEN** output includes `mcp-tool:` ids for `describe_table` and `query_table`
  (or the tools are registered on the MCP server used by `serve`)
