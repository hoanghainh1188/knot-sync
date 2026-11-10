# Spec Delta

## ADDED Requirements

### Requirement: Housen plugin is opt-in paid extractor

The 方眼紙 / form Excel extractor SHALL register through the plugin API as an
`extractor` extension (or equivalent layout rewriter invoked only when loaded)
and SHALL NOT be included in the CLI default built-in plugin list. Operators
enable it only by adding its package/path to config `plugins:`. The plugin MAY
perform its own license validation; the core host SHALL NOT reject plugins for
lacking a core-checked license field.

#### Scenario: Builtins list excludes housen

- **WHEN** an operator runs `knot-sync plugins` with no housen entry under
  `plugins:`
- **THEN** the loaded plugins/extractors do not include the housen plugin id
- **AND** office (and other built-ins) still load as today

#### Scenario: Listing plugin loads housen

- **GIVEN** config `plugins:` includes the housen plugin module
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the housen plugin (and its extractor id
  when registered as an extractor)
