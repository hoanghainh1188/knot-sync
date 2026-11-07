# Proposal

## Why

v0.1 features are implemented, but packages are still `0.0.1`, lack per-package
README/LICENSE, have no CI matrix, no publish workflow, no CHANGELOG, and no
ja/vi docs. KnotSync cannot be trusted as an installable npm CLI until release
hygiene and automated checks land.

## What Changes

- Bump all publishable workspace packages to **0.1.0** (keep root monorepo
  `private`).
- Ensure every package under `packages/*` ships **README.md** and **LICENSE**
  (Apache-2.0; LICENSE may be a copy or documented symlink strategy—prefer
  copied files so npm tarballs are self-contained).
- Add **CHANGELOG.md** at repo root covering v0.1.0.
- Add **docs/ja** and **docs/vi** (translated getting-started / overview
  mirroring English README essentials; English remains canonical in root
  README + `docs/ROADMAP.md`).
- GitHub Actions:
  - **CI**: `pnpm test` on Node **22** and **24**, OS matrix **Linux, macOS,
    Windows**.
  - **License check**: fail the job if runtime/transitive deps include GPL or
    AGPL (tool choice documented in design; MIT/BSD/Apache/ISC allowed).
  - **Publish**: on version tags (e.g. `v0.1.0`), publish public packages with
    **npm provenance** (`publishConfig.provenance` already set).
- Document how to verify `npx @hoanghainh/knot-sync` on a clean machine
  (checklist in README / release notes); actual publish may wait for the
  first tag after merge.
- Update README status / ROADMAP mark `prepare-npm-release` done when archived.

### Out of scope

- Actually publishing to npm from this change’s apply phase without Harry’s
  explicit tag/secret setup (workflows + dry-run docs only).
- Paid edition packages, OCR, HTTP MCP, Web UI (`knot-sync ui`).
- Full CLI message i18n (v0.2).
- Signing Windows binaries / native addons (none exist).
- Changing runtime product behavior beyond packaging/docs/CI.

## Capabilities

### New Capabilities

- `npm-release`: version 0.1.0, per-package README/LICENSE, CHANGELOG,
  publishable package metadata, npx verification checklist.
- `ci-cd`: GitHub Actions CI matrix (Node 22/24 × Linux/macOS/Windows),
  dependency license gate (fail on GPL/AGPL), tag-triggered publish with
  provenance.
- `docs-i18n`: Japanese and Vietnamese overview docs under `docs/ja` and
  `docs/vi`.

### Modified Capabilities

None required for runtime product specs; packaging is release infrastructure.

## Impact

- **Repo:** `.github/workflows/*`, `CHANGELOG.md`, `docs/ja/*`, `docs/vi/*`,
  per-package README/LICENSE, version bumps, possibly `files` in package.json
  to include README/LICENSE.
- **Deps:** Root **devDependency** `license-checker` (BSD-3-Clause) for the
  GPL/AGPL gate. No new runtime deps.
- **Ops:** Requires GitHub Actions enabled and (for publish) npm token /
  OIDC trusted publishing as documented in design.
