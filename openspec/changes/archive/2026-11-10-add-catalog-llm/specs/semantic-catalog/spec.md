# Spec Delta

## ADDED Requirements

### Requirement: Optional local-LLM fill for blank columns

When a licensed catalog-llm CatalogSource is registered, `describe` SHALL apply
it only to fill blank column labels (and empty descriptions) after free
dictionary and definition-Excel sources. LLM output MUST NOT mark columns
`reviewed: true`. When the plugin is absent, describe SHALL behave as today.

#### Scenario: Blank column after free sources may receive LLM draft

- **GIVEN** column `ma_xyz` with empty labels after dictionary/Excel
- **AND** catalog-llm is loaded and licensed with a working local endpoint
- **WHEN** `knot-sync describe` runs
- **THEN** the draft MAY include LLM-suggested label/description with
  `reviewed` false

#### Scenario: Non-blank free suggestion is kept

- **GIVEN** dictionary already filled ja for `TKSK_CD`
- **WHEN** describe runs with catalog-llm loaded
- **THEN** the free ja label is retained
- **AND** LLM does not overwrite it
