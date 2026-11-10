# Spec Delta

## ADDED Requirements

### Requirement: MCP tools work for enterprise SQL sources

When an enterprise SQL source is configured and the plugin is licensed,
`describe_table` and `query_table` SHALL accept that source id and table under
the same allow-list and parameterized-filter rules as Postgres/MySQL. Responses
SHALL frame cell values as untrusted document content. Dialect-specific
identifier quoting SHALL be applied for the engine in use.

#### Scenario: query_table on AS400 allow-listed table

- **GIVEN** an IBM i / AS400 source with allow-listed table `CUSTMAST` and
  column `CUSNAM`
- **AND** the enterprise plugin is loaded and healthy
- **WHEN** `query_table` runs with `equals` on `CUSNAM`
- **THEN** a parameterized query runs against only allow-listed identifiers
- **AND** returned cells are framed as untrusted data
