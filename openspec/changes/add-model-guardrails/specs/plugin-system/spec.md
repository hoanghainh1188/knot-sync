# Spec Delta

## ADDED Requirements

### Requirement: Document enricher extension contract

The plugin API SHALL support registering an async document enricher (id +
enrich function) that may inspect a cleaned document after rule-based PII and
guard and return additional guard/PII findings. Sync `PiiRule.find` /
`GuardRule.find` contracts remain offline (no network). Enrichers MAY perform
local HTTP only when their owning paid plugin is loaded and licensed.

#### Scenario: Enricher registers through plugin API

- **GIVEN** a plugin registers a document enricher with a unique id
- **WHEN** plugins load successfully
- **THEN** the host exposes that enricher to `run`
- **AND** duplicate enricher ids from another plugin fail load with an
  actionable message

### Requirement: guard-llm plugin is opt-in paid enricher

Model-based guard/PII enrichment SHALL register through the plugin API as a
document enricher and SHALL NOT be included in the CLI default built-in plugin
list. Operators enable it only by adding the package path to config `plugins:`.
The plugin MAY perform its own license validation; the core host SHALL NOT
reject plugins for lacking a core-checked license field.

#### Scenario: Builtins list excludes guard-llm

- **WHEN** an operator runs `knot-sync plugins` with no guard-llm entry under
  `plugins:`
- **THEN** the loaded plugins do not include the guard-llm plugin id
- **AND** free rule-based PII/guard still work as today

#### Scenario: Listing plugin loads guard-llm

- **GIVEN** config `plugins:` includes the guard-llm plugin module with a valid
  license
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the guard-llm plugin
