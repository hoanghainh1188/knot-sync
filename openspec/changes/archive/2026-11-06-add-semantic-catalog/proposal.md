# Proposal

## Why

SQL columns like `TKSK_CD` or `ma_kh` are opaque to agents even after allow-listed
query tools exist. KnotSync’s core value is a Semantic Catalog: business labels,
descriptions, and valid values so MCP tools speak the customer’s language
(Japanese / Vietnamese / English) without free SQL or LLM calls in the free core.

## What Changes

- New package `packages/catalog` (`@hoanghainh/knot-sync-catalog`) that builds and
  merges `knot-sync.catalog.yaml` for SQL sources.
- New CLI command `knot-sync describe` that generates/updates the catalog from:
  - DB introspection (via existing SQL connectors),
  - sampled distinct values (bounded, read-only),
  - optional テーブル定義書 / 項目定義書 Excel (column mapping configurable),
  - built-in dictionaries for romaji abbreviations (e.g. CD→コード, TKSK→得意先)
    and unaccented Vietnamese (e.g. ma→mã, kh→khách hàng),
  - optional customer dictionary file.
- Catalog entries per table and column: business label (ja/vi/en), description,
  type, valid values (enums), pii tag, expose flag, reviewed flag.
- Re-running `describe` MUST NOT overwrite entries marked `reviewed: true`.
- MCP: use the catalog to enrich tool descriptions, accept business-name
  parameters in `query_table` (resolve to physical columns), and validate enum
  filters when valid values are present.
- Widen `CatalogSource` from stub to an executable plugin contract; built-in
  dictionary / Excel inputs register as catalog-sources where appropriate.
- **Third-party dependency:** reuse `exceljs` (MIT) already used by
  `extractor-office` for reading definition Excel files (no new license class).
  No other new runtime deps unless listed here.

### Out of scope

- Local LLM / model-based label suggestions (paid edition).
- Auto-approving or auto-setting `reviewed: true`.
- Catalog for folder/document sources (SQL-focused in v0.1).
- Writing back into the customer database or definition Excel.
- Full i18n of CLI messages (planned v0.2).

## Capabilities

### New Capabilities

- `semantic-catalog`: catalog file format, `describe` command, dictionaries,
  optional Excel definition import, merge rules that preserve reviewed entries.
- `catalog-mcp`: MCP consumption of the catalog (tool descriptions, business-name
  query params, enum validation on `query_table`).

### Modified Capabilities

- `plugin-system`: `CatalogSource` becomes executable (not a stub).
- `sql-query`: `query_table` accepts catalog business names / enum checks when a
  catalog is loaded.
- `mcp-server`: load catalog at `serve` and apply catalog-mcp behavior.
- `config`: optional catalog path / describe settings (e.g. definition Excel path,
  dictionary path) as first-class or documented keys.

## Impact

- **Code:** `catalog` package; CLI `describe`; core types for catalog entries;
  SQL MCP tools + serve wiring; sample/minimal Excel fixture generated in tests
  (no real customer テーブル定義書 committed).
- **Deps:** `exceljs` (MIT) via workspace/catalog package.
- **Docs:** README `describe` + catalog example; ROADMAP mark done when archived.
  Note: a checked-in sample definition workbook is generated for examples/tests
  if missing (roadmap “needs sample” satisfied by fixture builder, not a
  customer dump).
