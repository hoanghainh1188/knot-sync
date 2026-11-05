# Tasks

## 1. Extractor contract and store helpers

- [x] 1.1 Widen `Extractor` / `ExtractResult` / `ExtractContext` in `packages/core` and export them; keep existing plugin tests green and add a unit test that a stub extractor registers and is listed
- [x] 1.2 Add `Store.listFiles` (and any helper needed to load a document by source path / compare `sourceFileHash`) in `packages/store-sqlite` with tests; verify with `pnpm test`

## 2. extractor-office package

- [x] 2.1 Create `packages/extractor-office` (`@hoanghainh/knot-sync-extractor-office`) with workspace wiring, `publishConfig`/`engines`/`files` copied from an existing package, and dependencies `exceljs` (MIT), `mammoth` (BSD-2-Clause), `unpdf` (MIT) only as listed in the proposal
- [x] 2.2 Implement extraction for `.xlsx`, `.docx`, text `.pdf`, `.csv`/`.tsv`, `.txt`, `.md` into Document (Markdown + tables); export default built-in plugin registering extractor id `office`
- [x] 2.3 Add tests that generate real fixtures in temp dirs (JP/VN sample text) for happy paths and assert corrupt/unsupported paths return extract failures; verify with `pnpm test`

## 3. CLI `run` command

- [x] 3.1 Register the office extractor as a built-in plugin; implement `knot-sync run` to load inventory, match extractors, skip unchanged hashes, upsert documents, report per-file issues without aborting
- [x] 3.2 Update help/`serve` stub messaging so `run` is available; add CLI tests for missing inventory, successful extract+searchable document, skip-on-same-hash, and corrupt file continues; verify with `pnpm test`

## 4. Docs and integration check

- [x] 4.1 Update README.md (`run` usage) and mark `add-office-extraction` done in `docs/ROADMAP.md`
- [x] 4.2 Run full `pnpm test` and a manual `scan` + `run` against a temp folder with generated fixtures; confirm exit 0 and documents land in the store

## Workflow follow-up

- Archive with `/opsx:archive add-office-extraction` after review.
- Commit on a feature branch and open a PR into `main`.
