# Tasks

## 1. Package metadata and docs artifacts

- [x] 1.1 Bump every `packages/*/package.json` to `0.1.0`; ensure `files` includes `README.md` and `LICENSE`; verify with `pnpm test`
- [x] 1.2 Add `LICENSE` (Apache-2.0 copy) and a short `README.md` to each package under `packages/*`; verify files exist via a small node:test or script assertion in CI/dev
- [x] 1.3 Add root `CHANGELOG.md` for 0.1.0 (include `describe` / Semantic Catalog and MCP); verify with `pnpm test` still green

## 2. Locale docs

- [x] 2.1 Add `docs/ja/` overview (install, read-only, main commands including `describe`/`serve`); verify content with a grep/node:test for required phrases
- [x] 2.2 Add `docs/vi/` overview (same topics in Vietnamese); verify required phrases with a test
- [x] 2.3 Link `docs/ja` and `docs/vi` from root `README.md`; add npx verification checklist; verify with `pnpm test`

## 3. CI, license gate, publish workflow

- [x] 3.1 Add `.github/workflows/ci.yml` matrix: Node 22/24 × ubuntu/macOS/windows, `pnpm install` + `pnpm test`; verify workflow YAML is present and matrix keys are correct (parse test)
- [x] 3.2 Add dependency license check (devDependency MIT/BSD/Apache/ISC only) that fails on GPL/AGPL; wire into CI and a local `pnpm` script; verify with `pnpm test` / script dry-run on current lockfile
- [x] 3.3 Add `.github/workflows/publish.yml` for `v*` tags with npm provenance / documented token; verify workflow file exists and references provenance or Trusted Publishing

## 4. Docs status and final check

- [x] 4.1 Mark `prepare-npm-release` done in `docs/ROADMAP.md`; align README status for 0.1.0 readiness
- [x] 4.2 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive prepare-npm-release` after review.
- Harry: configure npm Trusted Publishing or `NPM_TOKEN`, then `git tag v0.1.0 && git push origin v0.1.0`, then run npx verification on a clean machine.
