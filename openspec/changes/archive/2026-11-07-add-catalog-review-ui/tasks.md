# Tasks

## 1. UI package scaffold and build

- [x] 1.1 Create `packages/ui` (`@hoanghainh/knot-sync-ui`) with React + react-dom (MIT), Vite (MIT, dev), Apache-2.0 LICENSE, README, `publishConfig`/`engines`/`files`, and wire into root `tsconfig` / workspace — verify `pnpm install` and package builds
- [x] 1.2 Add Vite build producing static assets under the package `dist/` (or equivalent published path) with no CDN URLs in index HTML — verify a test or script asserts local-only asset references

## 2. Loopback server and catalog API

- [x] 2.1 Implement loopback `http` server helper: bind `127.0.0.1`, serve static UI, `GET /api/health`, `GET/PUT /api/catalog` via `loadCatalogFile`/`writeCatalogFile` — verify `node:test` with a temp catalog containing JP names (`受注` / `TKSK_CD`) round-trips labels and `reviewed`
- [x] 2.2 Reject or never offer non-loopback hosts; busy-port error is actionable — verify unit/integration coverage for bind host and port-in-use messaging

## 3. Catalog review React screen

- [x] 3.1 Build review UI: navigate sources → tables → columns; edit ja/vi/en labels, description, values, pii, expose, reviewed; filter unreviewed; save via `PUT /api/catalog` — verify component or API-driven tests cover save + unreviewed filter with a VN/JP fixture
- [x] 3.2 Wire UI chrome strings for `en`/`ja`/`vi` from the same locale resolution inputs as the CLI — verify Japanese chrome appears when locale is `ja`

## 4. CLI `ui` command

- [x] 4.1 Add `knot-sync ui` (`--port`, `-c/--config`, `--lang`), print `http://127.0.0.1:<port>/`, list in help; exit 1 on missing config — verify CLI tests for help listing `ui` and missing-config error
- [x] 4.2 Ensure CLI package depends on `@hoanghainh/knot-sync-ui` and published files include built assets needed at runtime — verify packaging/build test or `files` field includes UI assets

## 5. Docs and full verification

- [x] 5.1 Document `knot-sync ui` in root README and briefly in `docs/ja` / `docs/vi` — verify README mentions `ui` and loopback
- [x] 5.2 Mark `add-catalog-review-ui` done (or in progress at apply start / done at end) under v0.2 in `docs/ROADMAP.md` — verify roadmap status
- [x] 5.3 Run full `pnpm test` (including UI build) — verify all packages pass

## Workflow follow-up

- Archive the change after review (`/opsx:archive add-catalog-review-ui`).
- Then propose `add-bench`.
