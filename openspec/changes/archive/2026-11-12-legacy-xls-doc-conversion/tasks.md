# Tasks: Support Legacy Binary .xls and .doc Extraction

## 1. Dependencies & License Verification

- [x] 1.1 Add `cfb` (Apache-2.0) and `word-extractor` (MIT) to `packages/extractor-office/package.json` and install dependencies cleanly, then run `pnpm licenses:check` to confirm zero GPL/AGPL dependencies.

## 2. Pure-JS .xls (BIFF8) and .doc Extraction

- [x] 2.1 Implement pure-JS BIFF8 workbook reader (`packages/extractor-office/src/biff8.ts`) using `cfb` to parse sheet names (`BOUND_SHEET8`), shared string table (`SST` + `CONTINUE`, UTF-16LE / codepage), cell records (`LABELSST`, `LABEL`, `RSTRING`, `NUMBER`, `RK`, `MULRK`, `BOOLERR`, `FORMULA`/`STRING`), and `FILEPASS` encryption detection, enforcing `maxTextChars` and `maxTableRows` bounds.
- [x] 2.2 Implement `extractXls` and `extractDoc` (via `word-extractor`) in `packages/extractor-office/src/extract.ts`, add `".xls"` and `".doc"` to `OFFICE_EXTENSIONS`, and map corrupt, encrypted, or empty files to actionable `PARSE` / `EMPTY` issues without throwing unhandled errors.
- [x] 2.3 Add synthetic `.xls` (BIFF8 OLE2) and `.doc` (Word 97–2003 OLE2) fixture builders in `packages/extractor-office/src/fixtures.ts` and `node:test` unit tests in `packages/extractor-office/src/extractor-office.test.ts` covering Japanese `.xls` tables, Vietnamese `.doc` text, `maxTextChars` truncation, and corrupt/encrypted error handling; run `pnpm build && node --test packages/extractor-office/dist/*.test.js`.

## 3. End-to-End CLI Pipeline, Verification & Docs

- [x] 3.1 Add CLI `node:test` integration test in `packages/cli/src/` verifying `knot-sync scan` + `knot-sync run` + `knot-sync search` on `.xls` and `.doc` files flows through JA/VI cleaning, PII masking, and injection guard while keeping source files unmodified; run `pnpm test` and `pnpm bundle:cli`.
- [x] 3.2 Update `README.md` (documenting `.xls` and `.doc` support in built-in office extraction) and `docs/ROADMAP.md` (`legacy-xls-doc-conversion` status), then run `pnpm bundle:cli` to sync `packages/cli/README.md`.
