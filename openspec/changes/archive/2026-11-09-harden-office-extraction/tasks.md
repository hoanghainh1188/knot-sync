# Tasks

## 1. Config `extraction` section

- [x] 1.1 Add `ExtractionConfig` types, defaults (`maxFileSizeMb` 50,
      `timeoutSeconds` 30, `maxTextChars` 500000), parse/validate in
      `packages/core`, and include `extraction` in core top-level keys +
      starter YAML comments — verify with unit tests for defaults, partial
      override, unknown key, and non-positive values
- [x] 1.2 Expose parsed `extraction` on the structural config used by the CLI
      — verify a loadConfig fixture returns the expected numbers

## 2. Extractor hardening

- [x] 2.1 Enforce size check (`SKIPPED_TOO_LARGE`) and per-file timeout
      (`EXTRACT_TIMEOUT`) on `run` / extractor entry using
      `ExtractContext.signal` — verify tests that oversized files and
      timed-out extracts become issues without aborting the suite’s mock run
- [x] 2.2 Switch `.xlsx` extraction to ExcelJS streaming/bounded-memory path;
      keep JP sheet/header fixtures green — verify
      `packages/extractor-office` tests for Japanese workbook tables
- [x] 2.3 Stream/chunk `.csv`/`.tsv`/`.txt` (and `.md` as plain) under
      `maxTextChars` with observable truncation — verify Vietnamese CSV
      within bounds and an oversized delimited fixture truncates safely

## 3. Docs and integration

- [x] 3.1 Document `extraction:` in root README (and sync CLI README via
      existing pack path) and mark `harden-office-extraction` done in
      `docs/ROADMAP.md` — verify the README mentions `maxFileSizeMb` /
      `SKIPPED_TOO_LARGE`
- [x] 3.2 Run `pnpm test` and confirm all suites pass

## Workflow follow-up

- Archive with `/opsx:archive` after review/merge.
- Continue v0.3 with `harden-sql-connector` when ready.
