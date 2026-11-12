# Proposal: Support Legacy Binary .xls and .doc Extraction

## Why

Japanese and Vietnamese SMEs hold decades of active invoices, contracts, and spreadsheets in legacy binary `.xls` (Excel 97–2003 BIFF8) and `.doc` (Word 97–2003 OLE2) formats. Today `@hoanghainh/knot-sync-core` maps `.xls` and `.doc` file extensions during `scan`, but `@hoanghainh/knot-sync-extractor-office` rejects them as `UNSUPPORTED` during `run`, forcing users to manually convert files before indexing.

## What Changes

- Extend `@hoanghainh/knot-sync-extractor-office` (`OFFICE_EXTENSIONS` and `extractOfficeFile`) to extract legacy binary `.xls` spreadsheets (sheet names, tabular `TableData`, and Markdown output) and `.doc` documents (extracted body text, UTF-16LE / Shift-JIS / Windows-1258 / legacy encodings) in pure Node.js with zero external OS binaries.
- Feed extracted `.xls` and `.doc` `Document`s through the standard `run` pipeline (`cleaner-ja-vi`, `pii-basic`, `guard`, and SQLite FTS5 indexing) identically to `.xlsx` and `.docx`.
- Handle password-protected / encrypted, corrupt, or empty `.xls`/`.doc` files gracefully by returning structured `EXTRACT` / `PARSE` / `EMPTY` issues without aborting `knot-sync run`.
- Add synthetic binary `.xls` and `.doc` fixture builders and `node:test` unit + CLI integration tests covering Japanese and Vietnamese text, PII masking, and injection guard behavior.
- Update `README.md` and `docs/ROADMAP.md` (`legacy-xls-doc-conversion` status).

### Out of Scope

- External OS binary conversion (`soffice` / LibreOffice headless subprocesses) — kept out of core to preserve zero-binary npm installation (`npm i -g @hoanghainh/knot-sync`).
- Password-cracking or decrypting DRM/password-protected `.xls`/`.doc` files (returned as actionable `PARSE` issues).
- Legacy `.ppt` (PowerPoint 97–2003) binary extraction and paid 方眼紙 (`extractor-housen`) heuristics for `.xls` (paid `extractor-housen` remains `.xlsx`-only unless extended separately).
- Any write-back or in-place conversion of customer `.xls`/`.doc` files on disk (strictly read-only).

## Capabilities

### New Capabilities

- _(None — extends the existing `document-extraction` capability.)_

### Modified Capabilities

- `document-extraction`: Extend `Office and text formats are extracted` to include `.xls` and `.doc` binary Office formats using permissive pure-JS extraction, feeding the standard JA/VI cleaner, PII masker, and guard pipeline while keeping customer sources read-only.

## Dependencies

New permissive-licensed pure-JS dependencies in `packages/extractor-office/package.json` (checked by `pnpm licenses:check`, zero native bindings):
- `cfb` (**Apache-2.0**): Pure-JS OLE2 Compound File Binary parser for reading `.xls` (`Workbook` / `Book`) streams.
- `word-extractor` (**MIT**): Pure-JS Word 97–2003 `.doc` text extractor.

## Impact

- **`packages/extractor-office`**: Add `cfb` and `word-extractor` dependencies, implement `extractXls` and `extractDoc` in `src/extract.ts`, add `".xls"` and `".doc"` to `OFFICE_EXTENSIONS`, and add pure-JS binary fixture helpers + unit tests.
- **`packages/cli`**: Integration test coverage verifying `knot-sync scan` + `knot-sync run` + `knot-sync search` on `.xls` and `.doc` files with JA/VI text, PII masking, and guard flagging.
- **Docs**: `README.md` (`packages/cli/README.md` synced via `bundle:cli`) and `docs/ROADMAP.md`.
