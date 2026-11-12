# Tasks: Expand UI with Document Explorer & Health

## 1. Store Support for Run Issues & Sanitized Document Summaries

- [x] 1.1 Add `run_issues` table (`CREATE TABLE IF NOT EXISTS run_issues`) and `replaceRunIssues`, `listRunIssues`, `listScanIssues`, `listAllSourceStats`, and `listSanitizedDocuments` helpers in `packages/store-sqlite/src/index.ts`, ensuring `listSanitizedDocuments` omits `metadata.originalContent`, `metadata.originalTables`, and raw PII substrings while supporting keyword (`q`), `sourceId`, `type`, `guardRisk`, and `limit`/`offset` filtering.
- [x] 1.2 Update `runSyncPass` in `packages/cli/src/sync-cycle.ts` to call `store.replaceRunIssues(issues)` after processing inventory so extraction issues persist for UI inspection; verify existing CLI sync tests pass.
- [x] 1.3 Add `node:test` unit tests in `packages/store-sqlite/src/store.test.ts` covering `run_issues` round-trip/replacement, `listScanIssues`, JP/VN keyword + `guardRisk` filtering, and verification that `originalContent` and raw PII never appear in sanitized summaries; run `node --test packages/store-sqlite/dist/store.test.js`.

## 2. Read-Only UI Server APIs & CLI Wiring

- [x] 2.1 Wire `@hoanghainh/knot-sync-store-sqlite` and `@hoanghainh/knot-sync-core` into `packages/ui/package.json` and `packages/ui/tsconfig.json`, and add optional `storePath?: string` to `CreateUiServerOptions` in `packages/ui/src/server.ts`.
- [x] 2.2 Implement `GET /api/documents` and `GET /api/health-summary` in `packages/ui/src/server.ts` (rejecting non-GET requests with `405`, returning `storeExists: false` cleanly without creating a SQLite file when `storePath` is missing/absent, and closing `Store` in `finally`), and pass `storePath: structural.store.path` from `cmdUi` in `packages/cli/src/main.ts`.
- [x] 2.3 Add `node:test` HTTP API tests in `packages/ui/src/server.test.ts` verifying `GET /api/documents` (search/filter, JP/VN titles, absence of `originalContent`/raw PII), `GET /api/health-summary` (source health stats + `scan_issues` + `run_issues`), missing-store `storeExists: false` without side-effect file creation, and `405` on `POST`/`PUT`/`DELETE` to document/health endpoints; run `node --test packages/ui/dist/server.test.js`.

## 3. React Documents & Health Tab and EN/JA/VI Chrome

- [x] 3.1 Add `en`, `ja`, and `vi` localization strings for the **Documents & Health** tab, filter controls, risk/PII badges, health stats, issue table, and empty states in `packages/ui/src/chrome-i18n.ts`.
- [x] 3.2 Implement top-level tab navigation (**Catalog Review** | **Documents & Health**) and the read-only Documents & Health UI (search box, source/type/risk filters, paginated document list + sanitized snippet/badge detail pane, per-source health cards, and scan/run issue table) in `packages/ui/src/client/`, keeping zero CDN references.
- [x] 3.3 Add `node:test` checks in `packages/ui/src/chrome-i18n.test.ts` and `packages/ui/src/assets.test.ts` covering `en`/`ja`/`vi` Document Explorer keys and zero CDN URLs in built assets; run `pnpm build` and `node --test packages/ui/dist/*.test.js`.

## 4. Full Verification & Documentation

- [x] 4.1 Run full `pnpm test`, `pnpm licenses:check`, and `pnpm bundle:cli` to confirm all unit/integration tests pass, zero GPL/AGPL dependencies exist, and the bundled CLI UI works cleanly.
- [x] 4.2 Update `README.md` (documenting the read-only **Documents & Health** tab under `knot-sync ui`) and `docs/ROADMAP.md` (`expand-ui-document-explorer` status).
