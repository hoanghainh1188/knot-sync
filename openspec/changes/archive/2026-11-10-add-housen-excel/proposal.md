# Proposal

## Why

Japanese ops still use **方眼紙-style / form-like Excel** (labels beside values,
merged title cells, sparse grids). Built-in `extractor-office` treats the first
row as a table header and dumps every row as a flat Markdown table—so agents
get noisy dumps instead of structured fields. Paid roadmap item **方眼紙 Excel**
closes that gap without changing the free path.

## What Changes

- Add an **opt-in paid extractor plugin** (`packages/extractor-housen`, private
  workspace package) that detects form-like `.xlsx` layouts and emits structured
  Markdown (sections + label/value pairs / small tables) into the Document model
- Wire **CLI preference / rewrite**: when the plugin is loaded and licensed, and
  a sheet is classified as form-like, `knot-sync run` uses the housen layout
  result instead of the flat office dump for that file (plain tabular sheets
  keep the office path)
- Plugin **self-checks** a license key (env or plugin settings); core never
  validates licenses
- Soft-fail with actionable codes on license / parse / timeout / size—never
  write to the source tree
- Document `plugins:`, settings, and mark Paid 方眼紙 in `docs/ROADMAP.md` when
  done

**Assumptions:**

- v1 uses **deterministic heuristics** (merged cells, sparsity, JP label
  patterns)—not a local LLM layout model (that can be a later paid item)
- Same monorepo private-plugin pattern as OCR; not a free CLI built-in
- Only `.xlsx` (not old binary `.xls`)

## Capabilities

### New Capabilities

- `housen-excel`: opt-in form/grid Excel layout detection and structured extract
  for JP-style ops sheets, with license self-check and soft-fail codes

### Modified Capabilities

- `document-extraction`: when the housen plugin is loaded, form-like `.xlsx`
  Documents come from housen layout rather than the flat office dump; plain
  tables stay on office
- `plugin-system`: document paid housen as an opt-in plugin (not a default
  built-in) with license-self-check expectation
- `config` (light): optional `extractor-housen:` settings (thresholds, license
  env)—validated by the plugin

## Impact

- Code: new `packages/extractor-housen`, small CLI helper (like OCR fallthrough),
  fixtures built in tests via ExcelJS
- Product: free installs unchanged until `plugins:` lists housen
- Dependencies: **exceljs** (MIT)—already used by `extractor-office`; no native
  deps; no network at runtime

## Out of scope

- Old binary `.xls` / `.doc`
- LLM / vision layout models
- Making housen a default built-in of the free CLI
- Core license-key enforcement
- Writing reformatted files back into the customer source
- OCR, OAuth, vector search, extra SQL engines
- Guaranteeing layout accuracy percentages in marketing
