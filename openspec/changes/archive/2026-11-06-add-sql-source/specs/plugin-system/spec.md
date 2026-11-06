# Spec: plugin-system (delta)

## ADDED Requirements

### Requirement: SQL connectors as built-in plugins

The host SHALL load the built-in SQL connector plugin by default so that source
types `postgres` and `mysql` resolve through the connector registry without a
`plugins:` entry. Each type SHALL parse `url: env:NAME` and a non-empty
`allow` structure as required by the sql-source capability.

#### Scenario: postgres type resolves

- **WHEN** a source has `type: postgres` and valid `url` / `allow` fields
- **THEN** config resolution succeeds using the registered postgres connector

#### Scenario: Unknown SQL-like type still fails

- **WHEN** a source has `type: oracle` and no connector is registered for it
- **THEN** loading fails listing registered connector types including `postgres`
  and `mysql` when those plugins are loaded
