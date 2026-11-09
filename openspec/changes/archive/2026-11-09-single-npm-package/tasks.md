# Tasks

## 1. Private internals + CLI dependency surface

- [x] 1.1 Set `"private": true` on every `packages/*` except `cli`; remove or ignore their npm `publishConfig`; verify with a node:test or script that only `@hoanghainh/knot-sync` is non-private
- [x] 1.2 Declare all required third-party runtime deps on `packages/cli/package.json` (no `workspace:*` in the **publish** manifest); keep workspace deps for local `tsc` via a clear split (e.g. publish manifest generated or `bundleDependencies` approach per design) — verify `pnpm test` still green locally

## 2. Bundle for publish

- [x] 2.1 Add `esbuild` (MIT) as a devDependency and a `bundle:cli` (or `prepublishOnly`) script that bundles CLI + workspace packages, externalizes third-party deps, and includes UI static assets needed by `ui` — verify with `pnpm pack` in `packages/cli` that the tarball has no `workspace:` and includes `LICENSE`/`README.md`/`bin`
- [x] 2.2 Add a test asserting packed `package.json` dependencies are registry-safe and that the packed bin runs `--version` from the tarball extract — verify with `pnpm test`

## 3. CI + docs

- [x] 3.1 Update `.github/workflows/publish.yml` to publish only `@hoanghainh/knot-sync` (private packages skipped); keep Trusted Publishing / OIDC notes — verify workflow YAML references the CLI filter or equivalent
- [x] 3.2 Update README / CHANGELOG notes / ROADMAP: single npm package; document that paid plugins importing `@hoanghainh/knot-sync-core` are deferred; verify with `pnpm test` / grep assertions if present
- [x] 3.3 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive single-npm-package` after review.
- Harry: first manual `pnpm publish:cli` (registry packages already deleted), then Trusted Publisher for `@hoanghainh/knot-sync` only.
