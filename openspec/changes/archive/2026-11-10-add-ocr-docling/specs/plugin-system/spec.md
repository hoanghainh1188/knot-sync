# Spec Delta

## ADDED Requirements

### Requirement: OCR plugin is opt-in paid extractor

The Docling OCR extractor SHALL register through the plugin API as an
`extractor` extension and SHALL NOT be included in the CLI default built-in
plugin list. Operators enable it only by adding its package/path to config
`plugins:`. The plugin MAY perform its own license validation; the core host
SHALL NOT reject plugins for lacking a core-checked license field.

#### Scenario: Builtins list excludes OCR

- **WHEN** an operator runs `knot-sync plugins` with no OCR entry under
  `plugins:`
- **THEN** the loaded extractors do not include the OCR extractor id
- **AND** office (and other built-ins) still load as today

#### Scenario: Listing plugin loads OCR extractor

- **GIVEN** config `plugins:` includes the OCR plugin module
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the OCR plugin and an `extractor:` id for OCR
