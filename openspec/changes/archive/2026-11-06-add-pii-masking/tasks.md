# Tasks

## 1. Config and PiiRule contract

- [x] 1.1 Add `PiiConfig` parsing/defaults/errors in `packages/core`; export types; tests for default mask, bad mode, unknown key
- [x] 1.2 Widen `PiiRule` to executable `find(text)`; validate on register; stub registration test; verify with `pnpm test`

## 2. pii-basic package

- [x] 2.1 Create `packages/pii-basic` (`@hoanghainh/knot-sync-pii-basic`) with workspace wiring; **no third-party runtime deps**
- [x] 2.2 Implement rules: email, phone-jp, phone-vn, cccd, my-number (check digit), credit-card (Luhn); span merge; mask/hash/drop apply helpers; local salt file
- [x] 2.3 Tests with JP/VN fixtures (phones, CCCD, My Number valid/invalid, email, Luhn); hash stability; unmasked string absent from output; verify with `pnpm test`

## 3. CLI `run` and `scan --pii`

- [x] 3.1 Register built-in pii-basic from `config.pii`; after cleaners on `run`, detect+apply then upsert; on failure store error without unmasked PII
- [x] 3.2 Add `scan --pii` sampling for text-like small files; expose `piiLikelyFiles` in text + JSON; never print match text
- [x] 3.3 CLI tests: masked searchable content, `Document.pii` present, `--pii` estimate, default scan unchanged; verify with `pnpm test`

## 4. Docs and final check

- [x] 4.1 Update README.md (`pii:`, `--pii`) and mark `add-pii-masking` done in `docs/ROADMAP.md`
- [x] 4.2 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-pii-masking` after review.
- Commit on a feature branch and open a PR into `main`.
