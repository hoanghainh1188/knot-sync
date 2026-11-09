# npm-release Specification

## Purpose

Makes KnotSync workspace packages publishable as Apache-2.0 npm packages at
version 0.1.0 with self-contained metadata and a changelog.

## Requirements

### Requirement: Version 0.1.0 on publishable packages

The only npm-publishable package in this repository SHALL be
`@hoanghainh/knot-sync` under `packages/cli`, at version `0.1.0` (until a later
release bumps it). Every other package under `packages/*` SHALL set
`"private": true` so it is not published to the registry. The monorepo root
remains private.

#### Scenario: CLI package version

- **WHEN** `packages/cli/package.json` is inspected
- **THEN** its `version` field is `0.1.0`
- **AND** its `name` is `@hoanghainh/knot-sync`
- **AND** it is not marked `"private": true`

#### Scenario: Internal packages are private

- **WHEN** `packages/core/package.json` is inspected
- **THEN** it has `"private": true`

### Requirement: README and LICENSE in each package

Each package directory under `packages/*` SHALL contain a `README.md` and a
`LICENSE` file (Apache-2.0 text) for contributors and for the published CLI
tarball. Only the CLI package’s README/LICENSE are required inside the npm
artifact; other packages keep local copies for the monorepo.

#### Scenario: Catalog package has README and LICENSE

- **WHEN** `packages/catalog/` is listed
- **THEN** both `README.md` and `LICENSE` exist in that directory

### Requirement: package files include docs

The publishable CLI package’s `files` (or equivalent packing config) SHALL
include `README.md` and `LICENSE` in the published artifact in addition to
built runtime output (excluding test artifacts).

#### Scenario: Packed CLI includes LICENSE

- **WHEN** the CLI package is packed for publish (`pnpm pack` or equivalent)
- **THEN** the tarball contents include `LICENSE` and `README.md`

### Requirement: CHANGELOG for 0.1.0

The repository SHALL include a root `CHANGELOG.md` that documents the v0.1.0
release highlights in English (user-visible features: scan/run/describe/serve,
SQL, catalog, MCP, cleaning, PII, guard, HTML report).

#### Scenario: Changelog mentions describe

- **WHEN** a reader opens `CHANGELOG.md` for 0.1.0
- **THEN** it mentions Semantic Catalog / `describe` (or equivalent wording)

### Requirement: npx verification checklist

Release documentation SHALL include steps to verify
`npx @hoanghainh/knot-sync --version` (or `npx @hoanghainh/knot-sync -h`) on a
machine without a prior local install, after packages are published.

#### Scenario: README or release notes document npx check

- **WHEN** a maintainer follows the documented verification steps
- **THEN** the steps name `npx @hoanghainh/knot-sync` and the expected success
  signal (version or help text)

### Requirement: Single published package is self-contained

The published `@hoanghainh/knot-sync` tarball SHALL run `knot-sync` via `npx`
without requiring any other `@hoanghainh/knot-sync-*` package on the npm
registry. Its `package.json` `dependencies` MUST NOT use `workspace:` protocol
and MUST NOT list unpublished workspace package names as runtime dependencies.

#### Scenario: Packed dependencies are registry-installable

- **WHEN** `packages/cli/package.json` as prepared for publish is inspected
- **THEN** every runtime dependency is a public npm package (version range)
- **AND** no dependency name matches `@hoanghainh/knot-sync-` except the CLI
  itself if self-referenced (it MUST NOT depend on sibling workspace packages)

#### Scenario: npx works from the single package

- **WHEN** a clean environment installs only `@hoanghainh/knot-sync@0.1.0` from
  the registry (or an equivalent packed tarball)
- **THEN** `knot-sync --version` exits 0 and prints the package version
