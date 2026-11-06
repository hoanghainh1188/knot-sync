# Tasks

## 1. Config and GuardRule contract

- [x] 1.1 Add `GuardConfig` / `GuardFinding` / `Document.guard` in `packages/core`; parse `guard:` defaults/errors; reserve `guard` key; tests for default `flag`, bad mode, unknown key; verify with `pnpm test`
- [x] 1.2 Widen `GuardRule` to executable `find(text)`; validate on register; update plugin tests; persist `guard_json` in store-sqlite (ALTER on open); verify with `pnpm test`

## 2. guard package

- [x] 2.1 Create `packages/guard` (`@hoanghainh/knot-sync-guard`) with workspace wiring; **no third-party runtime deps**
- [x] 2.2 Implement rules: `instruction-en`, `instruction-ja`, `instruction-vn`, `controls`, `hidden-text`; span merge; risk levels; flag/strip/block apply helpers
- [x] 2.3 Tests with EN/JP/VN phrase fixtures, zero-width controls, strip/block behavior, hidden metadata channel; verify with `pnpm test`

## 3. Extractor hook and CLI `run`

- [x] 3.1 Best-effort xlsx `guardHiddenText` in extractor-office when exceljs exposes hidden/white text; test when fixture can set style; verify with `pnpm test`
- [x] 3.2 Register built-in guard from `config.guard`; after PII on `run`, detect+apply then upsert; block/error paths without promoting injected ready content
- [x] 3.3 CLI tests: flag keeps text + findings, strip removes phrase, plugins lists guard-rule; verify with `pnpm test`

## 4. Docs and final check

- [x] 4.1 Update README.md (`guard:`) and mark `add-injection-guard` done in `docs/ROADMAP.md`
- [x] 4.2 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-injection-guard` after review.
- Commit on a feature branch and open a PR into `main`.
