# Tasks

## 1. Housen plugin package skeleton

- [x] 1.1 Create `packages/extractor-housen` (private workspace package, plugin
      default export, `apiVersion` compatible) registering extractor id
      `housen-xlsx` for `.xlsx` — verify it appears in `knot-sync plugins` only
      when listed under `plugins:`
- [x] 1.2 Parse plugin settings (`timeoutSeconds`, `licenseEnv` / `licenseKey`,
      detection thresholds); reject unknown keys and non-positive timeouts —
      verify unit tests
- [x] 1.3 License self-check: missing/invalid → `LICENSE` soft-fail; test
      sentinel allows extract — verify with JP path `申請/休暇届.xlsx` in
      messaging

## 2. Layout detection and structured emit

- [x] 2.1 Implement ExcelJS-based form-likeness scoring (merged cells, sparsity,
      label/value adjacency, JP label lexicon) — verify form fixture scores
      above threshold and dense table fixture scores below
- [x] 2.2 Emit structured Markdown (+ optional tables) for form sheets including
      labels like `氏名` / `請求日` — verify unit tests; source file bytes
      unchanged
- [x] 2.3 Honor max size / timeout; oversized or timed-out soft-fails — verify
      tests

## 3. CLI rewrite and docs

- [x] 3.1 Wire `run` helper: after successful office `.xlsx` extract, try housen
      rewrite when plugin loaded; plain tables keep office Document — verify
      mocked form rewrite + plain-table path that never replaces
- [x] 3.2 On LICENSE (and similar) when rewrite attempted, surface en/ja/vi CLI
      strings as needed — verify locale catalogs
- [x] 3.3 Update root README / Paid 方眼紙 row in `docs/ROADMAP.md`; document
      `plugins:` + license env; run full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-housen-excel` after apply review
- Commit / PR when Harry asks
