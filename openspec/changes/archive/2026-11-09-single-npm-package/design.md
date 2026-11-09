# Design: single-npm-package

## Context

See proposal.md. End users already use one name (`@hoanghainh/knot-sync`); the
registry currently expects every `workspace:*` dependency to be published.
Read-only / fully-local product guarantees are unchanged — this is packaging
only.

## Goals / Non-Goals

**Goals**

- One public npm package; monorepo packages stay for DX/tests.
- `npx @hoanghainh/knot-sync` works without sibling `@hoanghainh/knot-sync-*`.
- CI Trusted Publishing configures **one** package.

**Non-Goals**

- Merging source trees; changing plugin APIs; publishing core for paid plugins
  in this change.

## Decisions

### 1. Keep packages, mark internal private

Set `"private": true` on every `packages/*` except `packages/cli`. Remove
`publishConfig` from private packages (or leave harmless). Development and
`pnpm test` keep using project references + `workspace:*`.

### 2. Bundle workspace code into the CLI publish output

Use **esbuild** (MIT, devDependency on CLI or root) to produce a publishable
CLI bundle:

- Entry points: `packages/cli/src/bin.ts` (and any secondary entry if needed).
- Bundle all `@hoanghainh/knot-sync-*` workspace imports.
- **External:** true third-party packages (`yaml`, `@modelcontextprotocol/sdk`,
  `zod`, `exceljs`, `mammoth`, `unpdf`, `pg`, `mysql2`, `react`, `react-dom`,
  Node builtins).
- Output ESM under `packages/cli/dist/` (or `dist-bundle/`) matching `bin` /
  `main`.
- Copy UI static assets into the published `files` (from `packages/ui` build
  output), same paths the CLI resolves today.

**Alternative considered:** publish a folder of compiled JS per package inside
the CLI tarball without bundling. Rejected — more fragile path rewriting;
esbuild is simpler for `npx`.

**Alternative:** `pnpm deploy`. Rejected — still awkward with ESM + bin.

### 3. Flatten third-party deps onto the CLI `package.json`

For publish, CLI `dependencies` lists only externals (with ranges matching
current workspace packages). No `workspace:*`. A small script or checked-in
manifest keeps this list in sync (test asserts no `workspace:` in the pack
manifest).

### 4. Dual build path

- **Dev/test:** existing `tsc -b` + UI Vite build (unchanged).
- **Publish pack:** `pnpm build` then `pnpm bundle:cli` (esbuild) then
  `pnpm pack` / `pnpm publish` from CLI filter.

`prepublishOnly` on the CLI runs bundle so accidental publish is safe.

### 5. Publish workflow

`.github/workflows/publish.yml` runs:

```bash
pnpm --filter @hoanghainh/knot-sync publish --access public --no-git-checks
```

(or `pnpm -r publish` which skips private packages). No `NPM_TOKEN` required
when Trusted Publishing is configured for `@hoanghainh/knot-sync` only.

### 6. Read-only / local

No new network at runtime; no source writes. Bundling is build-time only.

## Risks / Trade-offs

- **[Risk] Bundle size / native optional deps** → Keep `pg`/`mysql2` external;
  do not bundle native bindings.
- **[Risk] Dynamic plugin `import()` of workspace package names** → Built-in
  plugins are bundled; third-party plugins that imported
  `@hoanghainh/knot-sync-core` break until we re-export or publish core (out of
  scope; document).
- **[Risk] Source maps / debug** → Ship without heavy maps in publish; keep
  maps for local tsc builds.
- **[Risk] Leftover `@hoanghainh/knot-sync-core` on npm** → Operator unpublish
  with OTP (not automated).

## Migration Plan

1. Unpublish leftover registry packages (OTP).
2. Land this change; publish `@hoanghainh/knot-sync@0.1.0` once manually.
3. Configure Trusted Publisher for that single package + `publish.yml`.
4. Later tags publish via OIDC.

## Open Questions

None blocking — esbuild chosen as the MIT bundler.
