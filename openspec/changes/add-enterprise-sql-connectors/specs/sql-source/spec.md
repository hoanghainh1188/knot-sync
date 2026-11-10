# Spec Delta

## ADDED Requirements

### Requirement: Enterprise SQL source types when plugin loaded

When the enterprise SQL connector plugin is loaded and licensed, config MAY
declare SQL sources with the documented enterprise `type` values (SQL Server,
Oracle, Access, IBM i / AS400). Those sources SHALL follow the same env-only
URL and non-empty `allow` rules as Postgres/MySQL. When the plugin is not
loaded, unknown enterprise `type` values SHALL fail config/plugin resolution
with an actionable message (same as any unknown connector type today).

#### Scenario: mssql source parses with env URL

- **GIVEN** the enterprise plugin is loaded
- **AND** a source has type SQL Server, `url: env:KNOT_MSSQL_URL`, and a
  non-empty `allow` including a Vietnamese table name such as `hoa_don`
- **WHEN** config is loaded successfully
- **THEN** the connector accepts the source and resolves the URL from the env
  var at connect time
