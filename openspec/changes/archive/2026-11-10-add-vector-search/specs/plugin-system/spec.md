# Spec Delta

## ADDED Requirements

### Requirement: search-vector plugin is opt-in paid search

Vector embedding and `search_similar` SHALL register through the plugin API
(catalog/MCP/store-related hooks as designed) and SHALL NOT be included in the
CLI default built-in plugin list. Operators enable it only by adding the package
path to config `plugins:`. The plugin MAY perform its own license validation;
the core host SHALL NOT reject plugins for lacking a core-checked license field.

#### Scenario: Builtins list excludes search-vector

- **WHEN** an operator runs `knot-sync plugins` with no search-vector entry under
  `plugins:`
- **THEN** the loaded plugins do not include the search-vector plugin id
- **AND** free FTS search still works as today

#### Scenario: Listing plugin loads search-vector

- **GIVEN** config `plugins:` includes the search-vector plugin module with a
  valid license
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the search-vector plugin
