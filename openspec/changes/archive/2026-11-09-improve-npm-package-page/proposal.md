# Proposal

## Why

The published `@hoanghainh/knot-sync` page on npmjs.com shows only a one-line
description and a stub README that points to the GitHub root README. npm packs
`packages/cli/README.md`, not the repository root README, so visitors never see
the product story, quickstart, or MCP setup. The CLI `package.json` also lacks
`repository` / `homepage`, so registry metadata underlinks the source.

## What Changes

- Ship a full product README inside the CLI tarball (content aligned with the
  repository root README: why, quickstart, MCP registration, key features).
- Keep a single source of truth: root `README.md` is canonical; the publish
  pipeline copies it into `packages/cli/README.md` before pack (no divergent
  stub left in the published artifact).
- Add `repository` and `homepage` (and optionally enrich `description` /
  `keywords`) on `packages/cli/package.json` so npm metadata links to GitHub.
- Extend pack/publish tests to assert README substance (not just file presence)
  and that `repository` / `homepage` survive the publish manifest rewrite.
- Bump the publishable package version so a follow-up tag publish can refresh
  the live npm page (exact version chosen in tasks; expected next patch after
  `0.1.1`).

Out of scope:

- Redesigning the root README marketing copy beyond sync + metadata.
- Publishing localized READMEs as separate npm packages (`docs/ja`, `docs/vi`
  remain in the repo only).
- Changing the single-package publish model, bundle layout, or trusted
  publisher workflow.
- Actually running `npm publish` / creating the git tag (maintainer step after
  merge).
- v0.3 production hardening (`harden-office-extraction`, HTTP MCP, etc.).
- New third-party dependencies: **none**.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `npm-release`: Require a substantive CLI README in the packed tarball,
  registry-facing metadata (`repository`, `homepage`), and tests that guard
  those fields.

## Impact

- `packages/cli/package.json`, `packages/cli/README.md` (generated/synced)
- `scripts/bundle-cli.mjs` and/or `scripts/with-cli-publish-manifest.mjs`
- `packages/cli/src/pack-publish.test.ts`
- Root `CHANGELOG.md`, `docs/ROADMAP.md` (status note), version bump on the
  publishable package
- Live npm page after a later tag publish (not part of this change’s apply)
