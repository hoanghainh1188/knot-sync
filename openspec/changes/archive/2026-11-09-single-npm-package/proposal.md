# Proposal

## Why

Publishing every workspace package to npm forces a painful first release
(13 packages, Trusted Publisher per package) while end users only ever install
`@hoanghainh/knot-sync`. Shipping **one** public package keeps the monorepo for
development but matches how people actually consume KnotSync.

## What Changes

- Only `@hoanghainh/knot-sync` (`packages/cli`) is published to npm.
- All other `packages/*` become `"private": true` (still used via `workspace:*`
  in development and tests).
- Publish artifact of the CLI **bundles** (or otherwise inlines) workspace
  package code so the tarball has **no** `workspace:*` / `@hoanghainh/knot-sync-*`
  runtime dependencies on the registry.
- True third-party runtime deps (MIT/BSD/Apache/ISC only) are declared on the
  CLI package (e.g. `yaml`, `@modelcontextprotocol/sdk`, `zod`, `exceljs`,
  `mammoth`, `unpdf`, `pg`, `mysql2`, `react`, `react-dom` as needed).
- UI static assets required by `knot-sync ui` remain inside the published CLI
  package (same as today via `@hoanghainh/knot-sync-ui` files).
- CI publish workflow publishes **only** the CLI package (Trusted Publishing /
  OIDC after first manual publish of that one name).
- Docs (README, CHANGELOG notes, ROADMAP) state that npm exposes a single
  package; local monorepo layout is unchanged for contributors.

### Out of scope

- Flattening the git monorepo into one source folder (packages stay).
- Re-publishing `@hoanghainh/knot-sync-core` (etc.) for paid plugins — deferred
  until a paid plugin needs a public import path (may re-export from the CLI
  package or publish core later).
- Changing MCP/plugin runtime APIs or CLI commands.
- npm unpublish of any leftover registry packages (operator step; already
  mostly cleared — `@hoanghainh/knot-sync-core` needs OTP).

### New third-party dependency

- `esbuild` (MIT) as a **devDependency** (or root/cli) for the publish bundle
  step, unless an equivalent already-approved bundler is chosen in design.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `npm-release`: only `@hoanghainh/knot-sync` is publishable; internal packages
  are private; published tarball is self-contained without workspace deps on
  the registry.

## Impact

- **Code/tooling:** CLI pack/bundle script; `private: true` on internal
  packages; publish workflow filter; dependency list on CLI.
- **Docs:** README / release notes / ROADMAP wording for single-package npm.
- **Ops:** First publish becomes one `npm publish` / one Trusted Publisher.
