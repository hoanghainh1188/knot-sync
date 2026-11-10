# Spec Delta

## ADDED Requirements

### Requirement: Enterprise SQL plugin is opt-in paid connectors

The SQL Server / Oracle / Access / IBM i connectors SHALL register through the
plugin API as `connector` extensions and SHALL NOT be included in the CLI
default built-in plugin list. Operators enable them only by adding the package
path to config `plugins:`. The plugin MAY perform its own license validation;
the core host SHALL NOT reject plugins for lacking a core-checked license field.

#### Scenario: Builtins list excludes enterprise SQL types

- **WHEN** an operator runs `knot-sync plugins` with no enterprise SQL entry
  under `plugins:`
- **THEN** the loaded connectors do not include the four enterprise engine ids
- **AND** `postgres` / `mysql` / `fs` still load as today

#### Scenario: Listing plugin loads enterprise connectors

- **GIVEN** config `plugins:` includes the enterprise SQL plugin module with a
  valid license
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the plugin and connector ids for the
  supported enterprise engines
