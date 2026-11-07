## Purpose

Provides a local loopback web UI so operators can review and confirm Semantic
Catalog entries without hand-editing YAML, while never writing to customer
sources.

## ADDED Requirements

### Requirement: ui CLI command

`knot-sync ui` SHALL start a local web server that serves the bundled catalog
review UI. Help text SHALL list `ui` as available. The process SHALL exit
non-zero with an actionable message when the config or catalog path cannot be
used.

#### Scenario: Help lists ui

- **WHEN** the user runs `knot-sync --help`
- **THEN** the help text includes the `ui` command

#### Scenario: Missing config fails clearly

- **WHEN** the user runs `knot-sync ui -c /no/such/config.yaml`
- **THEN** the process exits with code 1
- **AND** stderr tells the user to run `knot-sync init` or fix `--config`

### Requirement: Loopback-only bind

The UI server SHALL listen on `127.0.0.1` (IPv4 loopback) by default. It MUST
NOT bind to `0.0.0.0` or other non-loopback interfaces in this change. A port
MAY be configurable; when the chosen port is busy, the command SHALL fail with
an actionable error (do not silently pick another host).

#### Scenario: Default listen address is loopback

- **WHEN** `knot-sync ui` starts successfully with defaults
- **THEN** the server accepts connections on `127.0.0.1`
- **AND** stderr or stdout prints a local URL using `127.0.0.1`

### Requirement: Bundled assets with no CDN

The published npm package SHALL include the built UI static assets. At runtime
the UI MUST load scripts/styles only from the local server (no external CDN
or network fetches for UI chrome).

#### Scenario: HTML references local assets only

- **WHEN** the UI index HTML is inspected in the published/built output
- **THEN** script and stylesheet URLs are relative or same-origin paths
- **AND** they do not point at third-party CDNs

### Requirement: Catalog review screen

The UI SHALL let an operator browse catalog sources, tables, and columns;
edit label fields `ja` / `vi` / `en`, description, `values`, `pii`, `expose`,
and `reviewed`; and save changes to the configured catalog YAML path.

#### Scenario: Japanese column label editable

- **GIVEN** a catalog with source `erp`, table `受注`, column `TKSK_CD`
- **WHEN** the operator sets label ja to `得意先コード` and saves
- **THEN** the catalog file on disk stores that ja label for that column

#### Scenario: Mark reviewed persists

- **WHEN** the operator sets `reviewed: true` on a column and saves
- **THEN** a subsequent load of the catalog file shows `reviewed: true` for
  that column

#### Scenario: Filter unreviewed columns

- **WHEN** the catalog has both reviewed and unreviewed columns
- **THEN** the UI offers a way to focus on unreviewed entries

### Requirement: Writes stay off customer sources

The UI and its local API SHALL write only the KnotSync catalog file (and MAY
touch other KnotSync-owned paths under the store/config directory if needed
for UI state). They MUST NOT create, modify, move, or delete files inside
configured source folders, and MUST NOT run write SQL against customer
databases.

#### Scenario: Save does not alter source folder

- **GIVEN** a folder source with existing files
- **WHEN** the operator saves catalog edits via the UI
- **THEN** no file under that source path is created, modified, or deleted

### Requirement: UI chrome locale

UI chrome (labels, buttons, empty states) SHALL follow the same locale
resolution as the CLI (`--lang`, then `cli.locale`, then env heuristic, else
`en`) for `en`, `ja`, and `vi`. Catalog physical names and stored label field
values remain as stored data (not auto-translated).

#### Scenario: Japanese UI chrome

- **WHEN** the user runs `knot-sync ui --lang ja`
- **THEN** primary UI chrome is Japanese
- **AND** physical column names such as `TKSK_CD` remain unchanged
