# Spec: ci-cd

## Purpose

Automates test, license compliance, and npm publish for KnotSync via GitHub
Actions.

## ADDED Requirements

### Requirement: CI test matrix

The repository SHALL provide a GitHub Actions workflow that runs the project
test suite on Node.js **22** and **24** across **Linux**, **macOS**, and
**Windows**.

#### Scenario: Workflow lists Node 22 and 24

- **WHEN** the CI workflow file is inspected
- **THEN** it configures jobs (or a matrix) including Node 22 and Node 24
- **AND** includes runners for ubuntu, macos, and windows

### Requirement: CI runs pnpm test

CI SHALL install dependencies with pnpm and run `pnpm test` (or an equivalent
that builds and executes the same test suite). A failing test SHALL fail the
workflow.

#### Scenario: Test failure fails the job

- **GIVEN** a commit that makes a unit test fail
- **WHEN** CI runs on that commit
- **THEN** the CI job exits with failure status

### Requirement: Dependency license gate

CI SHALL include a dependency license check that **fails** when a runtime or
bundled transitive dependency is licensed under GPL or AGPL (any version).
Permitted licenses include at least MIT, BSD, Apache-2.0, and ISC.

#### Scenario: GPL dependency fails CI

- **WHEN** the license checker detects a GPL-licensed dependency in the checked
  dependency set
- **THEN** the CI job fails with a message naming the package and license

### Requirement: Tag publish with provenance

A GitHub Actions publish workflow SHALL publish public `@hoanghainh/knot-sync*`
packages to npm when a version tag matching `v*` (e.g. `v0.1.0`) is pushed,
using npm provenance (OIDC / `provenance: true` as configured).

#### Scenario: Tag triggers publish workflow

- **WHEN** a maintainer pushes tag `v0.1.0`
- **THEN** the publish workflow runs
- **AND** is configured for npm provenance on the published packages
