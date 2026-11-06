# Tasks

## 1. Catalog package: types, merge, dictionaries

- [x] 1.1 Create `packages/catalog` (`@hoanghainh/knot-sync-catalog`) with workspace/tsconfig wiring; add runtime dep `exceljs` (MIT) only as listed in the proposal
- [x] 1.2 Define catalog YAML types + load/validate/write (version 1, sources/tables/columns, ja/vi/en labels, values, pii, expose, reviewed); verify with `pnpm test`
- [x] 1.3 Implement merge that preserves `reviewed: true` fields and adds new tables/columns; verify with `pnpm test`
- [x] 1.4 Implement built-in romaji and Vietnamese abbreviation dictionaries + optional customer dictionary file; verify JP/VN token expansion with `pnpm test`

## 2. CatalogSource API, Excel import, describe CLI

- [x] 2.1 Widen core `CatalogSource` to executable `suggest(...)`; register built-in dictionary catalog-sources; verify with `pnpm test`
- [x] 2.2 Implement optional definition Excel reader (`exceljs`) with configurable column mapping; build fixture workbook in tests (no customer 定義書 committed); verify with `pnpm test`
- [x] 2.3 Implement `describe` orchestration: SQL introspect + bounded distinct sampling (read-only) + catalog-sources + merge + atomic write; wire `knot-sync describe`; verify with `pnpm test`
- [x] 2.4 Add optional `catalog` config section (`path`, `dictionary`, `definition_excel`, `definition_mapping`); verify with `pnpm test`

## 3. MCP catalog consumption

- [x] 3.1 Load catalog on `serve`; enrich `describe_table` / schema resource with business labels; verify with `pnpm test`
- [x] 3.2 Resolve business-name filter columns in `query_table`; reject ambiguous labels; verify with `pnpm test`
- [x] 3.3 Validate equals/`in` filters against catalog `values` when non-empty; keep untrusted framing; verify with `pnpm test`

## 4. Docs and final check

- [x] 4.1 Update README.md (`describe`, catalog YAML example, MCP business names/enums) and mark `add-semantic-catalog` done in `docs/ROADMAP.md`
- [x] 4.2 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-semantic-catalog` after review.
