# Tasks

- [x] 1. **Demo dataset & sample catalog (`onboarding-demo`)**
  - [x] 1.1 Add `examples/.demo-data/` and demo store artifacts to `.gitignore`.
  - [x] 1.2 Create `scripts/create-demo-data.mjs` generating a real `.xlsx` (Japanese Wareki `令和6年4月1日`, full-width digits, repeated blank rows, synthetic My Number) and a `.txt`/`.csv` (Vietnamese TCVN3 `NguyÔn V¨n A`, synthetic CCCD) into `examples/.demo-data/`.
  - [x] 1.3 Create `examples/demo.config.yaml` and `examples/demo-catalog.yaml` (with `TKSK_CD` and `ma_kh` examples) and wire `"demo:prepare": "node scripts/create-demo-data.mjs"` in root `package.json`.
  - [x] 1.4 Add `node:test` integration test verifying `scripts/create-demo-data.mjs` + `scan` + `run` normalize JA/VI fixtures and mask synthetic PII.

- [x] 2. **Grouped CLI help & next-step hints (`cli-i18n`)**
  - [x] 2.1 Add `scan.next` and `run.next` keys to `packages/cli/src/i18n/messages.ts` and localize them in `en.ts`, `ja.ts`, `vi.ts`.
  - [x] 2.2 Reorganize `help` in `en.ts`, `ja.ts`, `vi.ts` into workflow stages without dropping or renaming any command or flag.
  - [x] 2.3 Emit `scan.next` and `run.next` in `packages/cli/src/main.ts` only when `--json` is false.
  - [x] 2.4 Update/add tests in `packages/cli/src/i18n/i18n.test.ts` and `packages/cli/src/cli.test.ts` verifying grouped help, JA/VI next-step hints, and pure `--json` output, then run `pnpm test`.

- [x] 3. **UI purpose & boundary banner (`catalog-review-ui`)**
  - [x] 3.1 Add localized `contextBanner` strings (`en`, `ja`, `vi`) in `packages/ui/src/chrome-i18n.ts` explaining SQL column labeling for AI and YAML-only persistence.
  - [x] 3.2 Render the banner in `packages/ui/src/client/App.tsx` and style it in `packages/ui/src/client/styles.css` (zero external assets).
  - [x] 3.3 Add `node:test` assertions in `packages/ui/src/chrome-i18n.test.ts` for `en`, `ja`, `vi` banner copy and run `pnpm test`.

- [x] 4. **Docs & roadmap sync**
  - [x] 4.1 Update `README.md`, `packages/cli/README.md`, `docs/vi/README.md`, `docs/ja/README.md`, and `docs/ROADMAP.md` with the `pnpm demo:prepare` walkthrough and status.
  - [x] 4.2 Run full `pnpm test` and `pnpm scan:sample`.
