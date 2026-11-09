# Design

## Context

See proposal.md — Why. Today `scripts/with-cli-publish-manifest.mjs` packs
`packages/cli/README.md` (stub) plus `LICENSE` and the esbuild bundle. The root
`README.md` is the real product page but never enters the tarball. Runtime
behavior, read-only sources, and fully-local execution are unchanged: this
change only affects packaging metadata and docs shipped to npm.

## Goals / Non-Goals

**Goals:**

- One canonical product README (repo root) appears on the npm package page.
- Registry metadata (`repository`, `homepage`) links to GitHub.
- Pack tests fail if the README regresses to a stub or metadata is dropped.

**Non-Goals:**

- Dual maintainership of two long README drafts checked into git.
- Changing esbuild externals, `publish-dependencies.json`, or trusted publisher.
- Automating the post-merge `npm publish` / git tag in this change.

## Decisions

### 1. Copy root README at pack/bundle time (canonical = root)

**Choice:** During `scripts/bundle-cli.mjs` (or immediately before pack in the
publish-manifest helper), `cp` root `README.md` → `packages/cli/README.md`.

**Why:** Avoids drifting copies. The monorepo root stays the edit surface;
npm always gets whatever is current at pack time.

**Alternatives considered:**

- Hand-maintain a full `packages/cli/README.md` duplicate → drift risk.
- Symlink root README into `packages/cli` → fragile on Windows and npm pack.
- Point `files` at `../../README.md` → npm `files` cannot leave the package
  directory.

**Git note:** Either commit the synced `packages/cli/README.md` after copy
(so browsing the package dir matches npm) or leave it generated and document
that pack regenerates it. Prefer committing the synced file so local `npm pack`
and GitHub package browse stay consistent without an extra step for humans.

### 2. Metadata lives in source `packages/cli/package.json`

**Choice:** Add:

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/hoanghainh1188/knot-sync.git"
},
"homepage": "https://github.com/hoanghainh1188/knot-sync#readme"
```

Optionally tighten `description` slightly (still one sentence, no unverified
percentages) and add keywords such as `semantic-catalog`, `pii`, `office` if
space allows.

**Why:** `with-cli-publish-manifest.mjs` rewrites dependencies/`files`/`bin` but
must not strip `repository` / `homepage`. Keeping them on the source package
means the rewrite preserves them by default.

### 3. Strengthen pack tests, not a separate docs package

**Choice:** Extend `pack-publish.test.ts` to assert README content markers
(`Quickstart`, `npx @hoanghainh/knot-sync`, Japanese/Vietnamese cues) and
`repository` / `homepage` on the packed `package.json`.

**Why:** Matches existing single-package publish tests; no new tooling.

### 4. Version bump for registry refresh

**Choice:** Bump `@hoanghainh/knot-sync` to the next patch (`0.1.2`) and update
CHANGELOG / npm-release version mentions. Actual publish remains a maintainer
step after merge (trusted publisher / tag), same as `0.1.1`.

**Why:** npm only refreshes the package README when a new version is published.

## Risks / Trade-offs

- **[Risk] Root README has relative links** (`./docs/ja/…`) that break on npmjs
  → **Mitigation:** Prefer absolute GitHub URLs for lang switchers in the root
  README, or accept that relative links resolve poorly on npm and keep primary
  CTAs as `npx` commands (absolute). Fix relative doc links in the same change
  if easy.
- **[Risk] Copied README grows the tarball** → Acceptable; docs are small vs
  `dist/bin.js` + `static/`.
- **[Risk] Forgetting to re-copy after editing root README** → Bundle/pack step
  always copies; CI pack test fails if package README is stale stub.

## Migration Plan

1. Land the change on `main` (metadata + sync + tests + `0.1.2` bump).
2. Maintainer tags `v0.1.2` (or whatever patch was chosen) to trigger publish.
3. Verify on npmjs.com: full README, repository link, `npx …@0.1.2 --version`.
4. Rollback: republish is append-only; fix-forward with another patch if needed.

## Open Questions

None material for implementation; patch version is `0.1.2` unless `0.1.1` was
never the live latest at apply time (re-check `npm view` before bumping).
