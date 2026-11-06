# Spec: plugin-system (delta)

## ADDED Requirements

### Requirement: CatalogSource contract is executable

A registered `CatalogSource` SHALL expose a stable `id` and a `suggest`
operation that returns suggested catalog fields for one table/column without
network I/O. The host SHALL invoke registered catalog-sources during
`describe` as documented in design.

#### Scenario: Dictionary source suggests Japanese expansion

- **WHEN** a catalog-source for romaji abbreviations is registered
- **AND** `suggest` is called for column `TKSK_CD`
- **THEN** the suggestion includes a ja label related to 得意先 / コード

#### Scenario: Catalog-source does not write sources

- **WHEN** any registered CatalogSource runs during `describe`
- **THEN** no file under a configured folder source and no customer DB row
  is created, updated, or deleted

### Requirement: Built-in dictionary and Excel catalog-sources

Built-in dictionary and optional Excel definition inputs SHALL register as
`catalog-source` extensions (or equivalent built-ins loaded by default) so
`describe` can consume them through the plugin registry.

#### Scenario: Default describe has dictionary sources

- **WHEN** `describe` runs with default plugins and no customer dictionary
- **THEN** built-in romaji and Vietnamese dictionary sources contribute
  suggestions for matching tokens
