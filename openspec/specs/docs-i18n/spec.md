# docs-i18n Specification

## Purpose

Provides Japanese and Vietnamese overview documentation so target users can
start without relying only on English.

## Requirements

### Requirement: Japanese docs directory

The repository SHALL include `docs/ja/` with at least one Markdown overview
that covers install (`npx` / Node requirement), that sources are read-only,
that the tool runs locally, and the main commands (`init`, `scan`, `run`,
`describe`, `serve`).

#### Scenario: Japanese overview mentions 読み取り専用 or equivalent

- **WHEN** a reader opens the primary Japanese overview under `docs/ja/`
- **THEN** it states that sources are not modified (読み取り専用 or clear
  equivalent)
- **AND** mentions MCP / `serve` in Japanese or with the command name

### Requirement: Vietnamese docs directory

The repository SHALL include `docs/vi/` with at least one Markdown overview
covering the same topics as the Japanese overview (install, local/read-only,
main commands), written in Vietnamese.

#### Scenario: Vietnamese overview mentions không ghi đè nguồn

- **WHEN** a reader opens the primary Vietnamese overview under `docs/vi/`
- **THEN** it states that customer sources are not written/changed
- **AND** lists or describes `scan` / `serve` (command names MAY stay English)

### Requirement: Root README links locale docs

The English root `README.md` SHALL link to `docs/ja/` and `docs/vi/` so
readers can find translations.

#### Scenario: README has ja and vi links

- **WHEN** the root README is inspected
- **THEN** it contains links to the Japanese and Vietnamese doc paths
