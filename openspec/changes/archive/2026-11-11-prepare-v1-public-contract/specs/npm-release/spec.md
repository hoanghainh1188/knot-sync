# Spec Delta

## ADDED Requirements

### Requirement: Paid plugins are not separate npm packages

The product README packed into `@hoanghainh/knot-sync` SHALL state that Paid
edition plugins (OCR, 方眼紙 Excel, enterprise SQL, OAuth, catalog-llm,
search-vector, guard-llm) are **not** published as separate packages on the npm
registry. Enablement SHALL be documented as: list the monorepo package path
under config `plugins:` and set that plugin’s license environment variable. The
core MUST NOT be described as checking license keys.

#### Scenario: README says Paid is not on npm

- **WHEN** a reader opens the Paid plugins section of the product README
- **THEN** it states that those plugins are not separate npm packages
- **AND** it documents `plugins:` plus license env vars as the enablement path
- **AND** it states that core does not check licenses

#### Scenario: npm tarball carries the same Paid note

- **WHEN** the published `@hoanghainh/knot-sync` tarball README is inspected
- **THEN** it contains the same Paid-not-on-npm clarification as the monorepo
  product README
