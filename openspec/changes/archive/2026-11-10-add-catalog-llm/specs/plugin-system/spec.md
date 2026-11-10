# Spec Delta

## ADDED Requirements

### Requirement: catalog-llm plugin is opt-in paid CatalogSource

Local-LLM catalog suggestions SHALL register through the plugin API as a
`catalog-source` extension and SHALL NOT be included in the CLI default
built-in plugin list. Operators enable it only by adding the package path to
config `plugins:`. The plugin MAY perform its own license validation; the core
host SHALL NOT reject plugins for lacking a core-checked license field.

#### Scenario: Builtins list excludes catalog-llm

- **WHEN** an operator runs `knot-sync plugins` with no catalog-llm entry under
  `plugins:`
- **THEN** the loaded plugins do not include the catalog-llm plugin id
- **AND** free dictionary CatalogSources still load as today

#### Scenario: Listing plugin loads catalog-llm

- **GIVEN** config `plugins:` includes the catalog-llm plugin module with a
  valid license
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the catalog-llm plugin
