# Spec: npm-release

## Purpose

Makes KnotSync workspace packages publishable as Apache-2.0 npm packages at
version 0.1.0 with self-contained metadata and a changelog.

## ADDED Requirements

### Requirement: Version 0.1.0 on publishable packages

Every package under `packages/*` that is intended for npm SHALL set
`version` to `0.1.0`. The monorepo root MAY remain private and unversioned for
publish.

#### Scenario: CLI package version

- **WHEN** `packages/cli/package.json` is inspected
- **THEN** its `version` field is `0.1.0`
- **AND** its `name` is `@hoanghainh/knot-sync`

### Requirement: README and LICENSE in each package

Each publishable package directory SHALL contain a `README.md` and a `LICENSE`
file (Apache-2.0 text) so that the npm tarball documents usage and license
without relying on the monorepo root alone.

#### Scenario: Catalog package has README and LICENSE

- **WHEN** `packages/catalog/` is listed
- **THEN** both `README.md` and `LICENSE` exist in that directory

### Requirement: package files include docs

Each publishable package’s `files` (or equivalent packing config) SHALL include
`README.md` and `LICENSE` in the published artifact in addition to built
`dist` (excluding test artifacts).

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
