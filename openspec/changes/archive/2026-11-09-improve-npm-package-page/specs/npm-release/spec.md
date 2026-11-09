# Spec Delta

## MODIFIED Requirements

### Requirement: Version 0.1.1 on publishable packages

The only npm-publishable package in this repository SHALL be
`@hoanghainh/knot-sync` under `packages/cli`, at version `0.1.2` (until a later
release bumps it). Every other package under `packages/*` SHALL set
`"private": true` so it is not published to the registry. The monorepo root
remains private.

#### Scenario: CLI package version

- **WHEN** `packages/cli/package.json` is inspected
- **THEN** its `version` field is `0.1.2`
- **AND** its `name` is `@hoanghainh/knot-sync`
- **AND** it is not marked `"private": true`

#### Scenario: Internal packages are private

- **WHEN** `packages/core/package.json` is inspected
- **THEN** it has `"private": true`

## ADDED Requirements

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
