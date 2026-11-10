# npm-release Specification

## Purpose

Makes KnotSync workspace packages publishable as Apache-2.0 npm packages at
version 0.1.3 with self-contained metadata and a changelog.

## Requirements

### Requirement: Version on publishable package

The only npm-publishable package in this repository SHALL be
`@hoanghainh/knot-sync` under `packages/cli`, at version `0.1.3` (until a later
release bumps it). Every other package under `packages/*` SHALL set
`"private": true` so it is not published to the registry. The monorepo root
remains private.

#### Scenario: CLI package version

- **WHEN** `packages/cli/package.json` is inspected
- **THEN** its `version` field is `0.1.3`
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

- **WHEN** a clean environment installs only `@hoanghainh/knot-sync@0.1.3` from
  the registry (or an equivalent packed tarball)
- **THEN** `knot-sync --version` exits 0 and prints the package version

### Requirement: Packed CLI README is the product README

The README included in the published `@hoanghainh/knot-sync` tarball SHALL be
the repository product README (same substance as the monorepo root `README.md`),
not a stub that only redirects readers to GitHub. It MUST document quickstart
via `npx @hoanghainh/knot-sync` and Japanese/Vietnamese legacy-data support.

#### Scenario: Packed README includes quickstart and JP/VN value

- **WHEN** the CLI package is packed for publish (`pnpm pack` or equivalent)
- **THEN** `package/README.md` in the tarball contains a Quickstart (or
  equivalent) section that names `npx @hoanghainh/knot-sync`
- **AND** the README mentions Japanese and Vietnamese legacy-data support
  (for example wareki / 和暦 and TCVN3 or VNI)

#### Scenario: Packed README is not a stub redirect

- **WHEN** the packed `package/README.md` is inspected
- **THEN** it is longer than a short stub (more than 20 non-empty lines)
- **AND** it does not rely solely on “see the repository root README” as the
  only usage documentation

### Requirement: CLI package exposes repository and homepage metadata

`packages/cli/package.json` SHALL declare `repository` (type `git`, URL of the
public GitHub repository) and `homepage` (URL of the repository or its README)
so the npm registry page links to source. Those fields MUST remain present in
the package.json written into the publish tarball after the publish-manifest
rewrite.

#### Scenario: Source package.json has repository and homepage

- **WHEN** `packages/cli/package.json` is inspected in the repository
- **THEN** it has a `repository` object with `type` `git` and a GitHub URL for
  `hoanghainh1188/knot-sync`
- **AND** it has a `homepage` string pointing at that repository (or its README)

#### Scenario: Packed package.json keeps repository and homepage

- **WHEN** the CLI package is packed for publish
- **THEN** `package/package.json` in the tarball still includes `repository`
  and `homepage` with the same GitHub target
