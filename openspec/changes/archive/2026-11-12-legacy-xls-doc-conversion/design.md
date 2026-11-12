# Design: Support Legacy Binary .xls and .doc Extraction

## Context

`@hoanghainh/knot-sync-core` already classifies `.xls` (`DocumentType = "xls"`) and `.doc` (`DocumentType = "doc"`) in `packages/core/src/filetype.ts`, so `knot-sync scan` inventories them automatically. However, `OFFICE_EXTENSIONS` and `extractOfficeFile` in `packages/extractor-office/src/extract.ts` only handle `.xlsx`, `.docx`, `.pdf`, `.csv`, `.tsv`, `.txt`, and `.md`. See `proposal.md` for motivation and scope.

## Goals / Non-Goals

**Goals:**
- Extract `.xls` (BIFF8 OLE2 binary workbooks) into Markdown + `TableData[]` (matching `.xlsx` table structure, respecting `maxTextChars` and `maxTableRows`).
- Extract `.doc` (Word 97–2003 OLE2 binary documents) into Markdown text (respecting `maxTextChars`).
- Keep extraction 100% pure-JS in Node.js >= 22.13 with Apache-2.0-compatible dependencies (`cfb` Apache-2.0, `word-extractor` MIT), zero external OS binaries, zero network calls, and strictly read-only source access.
- Feed resulting `Document`s through the existing `cleaner-ja-vi` -> `pii-basic` -> `guard` -> SQLite store pipeline without special-casing downstream stages.

**Non-Goals:**
- Spawning external OS converters (`soffice` / LibreOffice).
- Decrypting password-protected `.xls`/`.doc` files.
- Supporting legacy `.ppt` or paid 方眼紙 (`extractor-housen`) heuristics on `.xls`.

## Decisions

### 1. Pure-JS OLE2 + BIFF8 Extraction for `.xls` via `cfb` (Apache-2.0)
- **How**: Read the `.xls` file buffer (already bounded by `maxFileSizeMb` in `extractOfficeFile`), parse the OLE2 Compound File Binary container with `cfb` (Apache-2.0, zero transitive dependencies), and locate the `Workbook` (BIFF8) or `Book` (BIFF5) stream.
- **BIFF8 record parser (`src/biff8.ts`)**: Implement a focused, bounded BIFF8 record reader supporting:
  - `BOF` / `EOF` (workbook globals vs worksheet substreams)
  - `CODEPAGE` (codepage mapping for single-byte strings: CP932/Shift-JIS, CP1258/Vietnamese, CP1252)
  - `BOUND_SHEET8` (`0x0085`) for sheet names (compressed ASCII/Latin1 or UTF-16LE, including `CONTINUE` handling)
  - `SST` (`0x00FC`) + `CONTINUE` (`0x003C`) shared string table (handles 8-bit compressed vs 16-bit UTF-16LE strings, rich text runs, and phonetic `ExtRst` bytes)
  - Cell records: `LABELSST` (`0x00FD`), `LABEL` (`0x0204`), `RSTRING` (`0x00D6`), `NUMBER` (`0x0203` IEEE-754 float64), `RK` (`0x027E` & `MULRK` `0x00BD`), `BOOLERR` (`0x0205`), and `FORMULA` (`0x0006` cached string/number/bool value + `STRING` `0x0207` record)
  - `FILEPASS` (`0x002F`) detection → immediately fail with an actionable `PARSE` error indicating the `.xls` file is password-protected/encrypted.
- **Why `cfb` + focused BIFF8 parser instead of `xlsx` (SheetJS CE)?** SheetJS CE `0.18.5` on npm is unmaintained with known prototype pollution advisories and SheetJS moved newer releases off npm. A focused ~250-line TypeScript BIFF8 reader on top of `cfb` (Apache-2.0) gives us full control over memory bounds (`maxTextChars`, `maxTableRows`), `AbortSignal`, Shift-JIS/UTF-16LE encoding, and zero security advisories.

### 2. Pure-JS `.doc` Extraction via `word-extractor` (MIT)
- **How**: Pass the `.doc` buffer (bounded by `maxFileSizeMb`) to `word-extractor`'s `extract(bytes)` method, collect body text (`doc.getBody()` plus headers/footers/footnotes if non-empty), normalize whitespace, and enforce `maxTextChars`.
- **Why `word-extractor`?** It is MIT-licensed, pure JS, widely used for Word 97–2003 OLE2 `.doc` extraction (handles FIB, `1Table`/`0Table`, PieceTable `CLX`, compressed CP1252 and UTF-16LE Unicode runs), and avoids shelling out to `antiword` or LibreOffice.
- **Error mapping**: Empty body → `EMPTY` issue; encrypted/corrupt OLE2 stream → `PARSE` issue.

### 3. Read-Only & Fully-Local Guarantees
- **Read-only**: `extractOfficeFile` only calls `readFile(file.absPath)` — identical to `.docx` and `.pdf`. No temporary files are written inside customer source directories; no files are modified, moved, or deleted.
- **Fully local**: Both `cfb` and `word-extractor` operate strictly in-memory on local bytes with zero network calls or telemetry.

## Risks / Trade-offs

- **[Risk] Exotic BIFF5 (Excel 95) or non-standard codepage `.xls` files** → Detect `BOF` version; decode BIFF8 (`0x0600`) natively and map `CODEPAGE` (`932` Shift-JIS, `1258` Vietnamese, `1252` Windows-1252, `65001` UTF-8) via Node.js built-in `TextDecoder` where supported, falling back cleanly with a clear `PARSE` message for unsupported/encrypted streams.
- **[Risk] Large `.xls` workbooks exhausting memory** → Enforce `maxFileSizeMb` before reading bytes and stop collecting rows/characters once `maxTableRows` / `maxTextChars` caps are reached (setting `metadata.truncated = true` just like `.xlsx`).
