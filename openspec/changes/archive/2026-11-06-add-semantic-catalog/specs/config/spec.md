# Spec: config (delta)

## ADDED Requirements

### Requirement: Optional catalog section

Config MAY include a `catalog` object. Allowed keys: `path`, `dictionary`,
`definition_excel`, and `definition_mapping`. Unknown keys under `catalog`
SHALL fail config load with an actionable error listing allowed keys.

#### Scenario: Default catalog path

- **WHEN** config has no `catalog` key
- **THEN** `describe` writes to the documented default path next to the config
  (e.g. `knot-sync.catalog.yaml`)

#### Scenario: Reject unknown catalog key

- **WHEN** config contains `catalog: { llm: true }`
- **THEN** config load fails and the error lists allowed keys under `catalog`

### Requirement: Catalog path resolution

`catalog.path`, `catalog.dictionary`, and `catalog.definition_excel` SHALL
resolve relative to the config file directory when not absolute.
`definition_mapping` SHALL be an optional object whose sheet/header keys are
documented in design.

#### Scenario: Relative definition Excel resolves from config dir

- **GIVEN** config sets `catalog.definition_excel: ./defs/項目定義.xlsx`
- **WHEN** config is loaded
- **THEN** the path resolves relative to the config file directory
