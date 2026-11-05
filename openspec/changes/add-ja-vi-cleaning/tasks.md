# Tasks

## 1. Config and Cleaner contract

- [ ] 1.1 Add `CleaningConfig` parsing/defaults/unknown-key errors in `packages/core`; export types; tests for omit-all-true, partial override, unknown key, non-boolean
- [ ] 1.2 Widen `Cleaner` to executable `clean(document)` in core plugin types; keep existing plugin tests green; add a stub cleaner registration test; verify with `pnpm test`

## 2. cleaner-ja-vi package

- [ ] 2.1 Create `packages/cleaner-ja-vi` (`@hoanghainh/knot-sync-cleaner-ja-vi`) with workspace wiring and `publishConfig`/`engines`/`files` copied from an existing package; **no third-party runtime deps**
- [ ] 2.2 Implement steps in design order: legacyVietnamese → nfkc → wareki → datesIso → tokenReduce; set `originalContent` / token metadata; respect per-step toggles
- [ ] 2.3 Tests with in-code fixtures: NFKC (`２０２４`), wareki (`令和5年4月1日`, `令和元年`, kanji year), ISO dates, TCVN3/VNI sample, whitespace/empty-row reduction, all-steps-off identity (content); JP + VN scenarios required; verify with `pnpm test`

## 3. CLI `run` integration

- [ ] 3.1 Register built-in `cleaner-ja-vi` with settings from `config.cleaning`; after successful extract, run cleaners sequentially before upsert; on cleaner throw, store `error` with actionable message
- [ ] 3.2 CLI/integration tests: cleaned content searchable, original retained on document, tokens recorded, `cleaning.wareki: false` skips era conversion; verify with `pnpm test`

## 4. Docs and final check

- [ ] 4.1 Update README.md (`cleaning:` + cleaner behavior) and mark `add-ja-vi-cleaning` done in `docs/ROADMAP.md`
- [ ] 4.2 Full `pnpm test`; optional manual `scan` + `run` on a temp folder with JP/VN strings confirming cleaned store content

## Workflow follow-up

- Archive with `/opsx:archive add-ja-vi-cleaning` after review.
- Commit on a feature branch and open a PR into `main`.
