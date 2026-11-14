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

### Requirement: Locale overviews clarify Paid distribution

The primary Japanese overview under `docs/ja/` and the primary Vietnamese
overview under `docs/vi/` SHALL each state that Paid plugins are not published
as separate npm packages, and that operators enable them from the monorepo via
config `plugins:` plus each plugin’s license environment variable.

#### Scenario: Japanese overview mentions Paid not on npm

- **WHEN** a reader opens the primary Japanese overview under `docs/ja/`
- **THEN** it states that Paid plugins are not separate npm packages (or clear
  Japanese equivalent)
- **AND** it mentions `plugins:` and license env / ライセンス環境変数 (or
  clear equivalent)

#### Scenario: Vietnamese overview mentions Paid không trên npm

- **WHEN** a reader opens the primary Vietnamese overview under `docs/vi/`
- **THEN** it states that plugin trả phí không phải gói npm riêng (or clear
  equivalent)
- **AND** it mentions `plugins:` and biến môi trường license (or clear
  equivalent)

### Requirement: Trilingual 3-step Enterprise Pilot Playbook
The repository SHALL include `docs/PILOT_PLAYBOOK.md` (English) along with Japanese (`docs/ja/PILOT_PLAYBOOK.md`) and Vietnamese (`docs/vi/PILOT_PLAYBOOK.md`) translations documenting the 3-step Enterprise Pilot workflow: Step 1 (`scan --pii --report`), Step 2 (`describe` + `ui`), and Step 3 (LAN `serve --http` + MCP client setup).

#### Scenario: Japanese pilot playbook covers 3-step workflow and read-only safety
- **WHEN** a Japanese IT admin (情シス) opens `docs/ja/PILOT_PLAYBOOK.md`
- **THEN** it documents `knot-sync scan --pii --report`, `knot-sync describe` + `knot-sync ui`, and LAN `serve --http` with read-only (`:ro` / 読み取り専用) source guarantees

#### Scenario: Vietnamese pilot playbook covers 3-step workflow and read-only safety
- **WHEN** a Vietnamese IT admin opens `docs/vi/PILOT_PLAYBOOK.md`
- **THEN** it documents `knot-sync scan --pii --report`, `knot-sync describe` + `knot-sync ui`, and LAN `serve --http` with read-only (`:ro` / chỉ đọc) source guarantees

#### Scenario: Root README links to Enterprise Pilot Playbook
- **WHEN** a reader inspects `README.md`
- **THEN** it links to `docs/PILOT_PLAYBOOK.md`, `docs/ja/PILOT_PLAYBOOK.md`, and `docs/vi/PILOT_PLAYBOOK.md`
