# Design: prepare-npm-release

## Context

See proposal.md — Why. Product code for v0.1 exists; release infrastructure
does not. Constraints: Apache-2.0; no GPL/AGPL deps; Node ≥ 22.13; pnpm
workspace; packages already declare `publishConfig.access: public` and
`provenance: true`.

## Goals / Non-Goals

**Goals**

- 0.1.0 metadata + README/LICENSE per package + CHANGELOG.
- CI matrix + license gate + tag publish workflow.
- `docs/ja` + `docs/vi` overviews; README links.
- Document npx verification (post-publish).

**Non-Goals**

- Pushing the first npm release during apply without Harry’s tag/token.
- Translating the entire ROADMAP or OpenSpec tree.
- Changing MCP/SQL/catalog runtime behavior.

## Decisions

### 1. Version bump strategy

Set `"version": "0.1.0"` on every `packages/*/package.json`. Keep root
`knot-sync-monorepo` private. Internal `workspace:*` ranges stay; publish
will rewrite to concrete versions via `pnpm publish -r` (or
`pnpm -r publish --access public`) which replaces workspace protocol.

**Alternative:** single bundled package only. Rejected — workspace already
ships scoped packages with `publishConfig`.

### 2. LICENSE / README per package

- Copy root `LICENSE` into each `packages/*/LICENSE` (npm does not follow
  symlinks reliably across pack).
- Add a short `packages/<name>/README.md` (purpose, link to root README /
  docs, Apache-2.0). CLI README can be slightly richer (commands summary).
- Extend `"files"` to include `README.md` and `LICENSE`.

### 3. CHANGELOG format

Keep a Simple Keep-a-Changelog style section `## 0.1.0 — 2026-11-06` (or
release date at apply time) listing user-facing bullets. No automation
required for v0.1.

### 4. CI workflow

`.github/workflows/ci.yml`:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node: [22, 24]
```

Steps: checkout → corepack/pnpm → `pnpm install` → `pnpm test`.
Use `fail-fast: false` so one OS failure does not hide others.

Windows note: path lengths / `node:sqlite` — same Node builtins; if a test
is OS-flaky, fix or skip with documented reason (prefer fix).

### 5. License checker

Add **devDependency** `license-checker` (BSD) **or** `pnpm licenses list`
plus a small script that fails on GPL/AGPL regex. Prefer a maintained
checker with allow/deny lists:

- Allow: MIT, Apache-2.0, BSD-*, ISC, 0BSD, BlueOak-*, CC0-*, Unlicense, …
- Deny: GPL*, AGPL*, LGPL* (LGPL also blocked for simplicity / product
  constraint “no GPL/AGPL”; document if we later allow LGPL).

Run in CI after install. Exact package name recorded in tasks when chosen
(must be MIT/BSD/Apache/ISC).

### 6. Publish workflow

`.github/workflows/publish.yml` on `push: tags: ['v*']`:

1. checkout, pnpm install, pnpm test (gate).
2. `pnpm -r publish --access public --no-git-checks` with
   `NPM_CONFIG_PROVENANCE=true` / Trusted Publishing (OIDC) if configured;
   else `NODE_AUTH_TOKEN` secret documented for Harry.
3. Publish order: dependencies before dependents — `pnpm -r publish`
   handles topological order.

**Do not** publish from `main` push without a tag.

### 7. Docs i18n

- `docs/ja/README.md` — 概要 + インストール + コマンド.
- `docs/vi/README.md` — Tổng quan + cài đặt + lệnh.
- Root README: short links under a “Languages” / 日本語 / Tiếng Việt section
  (README already has a 日本語 stub — extend consistently).

English remains source of truth; translations may lag on detail.

### 8. npx verification

Document in CHANGELOG or README Release section:

```bash
npx @hoanghainh/knot-sync@0.1.0 --version
# expect 0.1.0
```

Apply phase adds the checklist; Harry runs it after first publish.

## Risks / Trade-offs

- [Windows CI flakes] → fail-fast false; fix SQLite/path tests if needed.
- [License false positives] → maintain allowlist; document overrides.
- [Trusted Publishing setup] → design documents both OIDC and classic token;
  apply creates workflow stubs Harry can wire to npm.
- [Duplicate LICENSE copies] → accept drift; occasional sync from root.

## Migration Plan

- Merge workflows before tagging.
- After merge: `git tag v0.1.0 && git push origin v0.1.0` when Harry is ready.
- Rollback: unpublish is discouraged; yank only if critical; prefer patch
  `0.1.1`.

## Open Questions

None material; npm Trusted Publishing vs classic token is an ops choice at
first tag time, not a code-block for specs.
