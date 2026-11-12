# Spec Delta

## Purpose

Provides opt-in Paid read-only connectors for Google Drive, SharePoint, and OneDrive so enterprises can inventory and extract cloud-hosted documents through KnotSync's local cleaning, PII masking, and injection guard pipeline.

## ADDED Requirements

### Requirement: Paid plugin registration and Ed25519 license enforcement

The `connector-cloud-drive` plugin SHALL register `gdrive`, `sharepoint`, and `onedrive` connectors via the plugin API and SHALL verify an Ed25519 signed license token from `KNOT_SYNC_CLOUD_DRIVE_LICENSE` (or `plugin` config) before `scan` or `readBytes` accesses remote data. The core package MUST NOT perform license checks.

#### Scenario: Missing or invalid license blocks scan
- **GIVEN** a config loading `connector-cloud-drive` with a `gdrive` source
- **AND** `KNOT_SYNC_CLOUD_DRIVE_LICENSE` is unset or invalid
- **WHEN** `knot-sync scan` runs
- **THEN** the connector refuses to call remote APIs and reports an actionable license error

#### Scenario: Valid license registers all three connectors
- **GIVEN** a valid Ed25519 license token for `connector-cloud-drive`
- **WHEN** `knot-sync plugins` runs
- **THEN** the output lists `connector:gdrive`, `connector:sharepoint`, and `connector:onedrive`

### Requirement: Read-only cloud drive inventory and incremental hashing

Each cloud drive connector (`gdrive`, `sharepoint`, `onedrive`) SHALL read credentials exclusively from environment variables named in source config, use read-only scopes, and yield `FileEntry` records with stable remote hashes (`md5Checksum`, `eTag`, or `modifiedTime`) for incremental `run` and stale-document pruning.

#### Scenario: Google Drive scan inventories Japanese and Vietnamese files
- **GIVEN** a `gdrive` source configured with `folder_id` and env-backed credentials
- **WHEN** `knot-sync scan` inventories `経理/請求書.xlsx` and `Hợp đồng.docx`
- **THEN** both entries are recorded in the store inventory with remote size and hash
- **AND** no write, move, or delete API requests are sent

#### Scenario: SharePoint or OneDrive scan supports incremental skip and prune
- **GIVEN** a `sharepoint` or `onedrive` source whose file list changes between two `scan` calls
- **WHEN** `knot-sync run` executes after the second `scan`
- **THEN** unchanged files are skipped by hash and deleted remote files are pruned from the store

### Requirement: In-memory byte extraction and Google Workspace export

When `knot-sync run` processes a cloud drive `FileEntry`, the connector SHALL fetch file bytes in memory via `readBytes`—exporting Google Docs/Sheets/Slides to `.docx`/`.xlsx`/`.pdf`—and feed them through `extractor-office`, JA/VI cleaner, PII masker, and injection guard without writing unmasked files to disk.

#### Scenario: Extracted cloud document is cleaned, masked, and guarded
- **GIVEN** a `gdrive` Google Sheet containing `令和6年5月1日` and `secret@example.co.jp`
- **WHEN** `knot-sync run` processes the inventory with `pii.mode: mask`
- **THEN** the stored Document contains `2024-05-01` and does not contain `secret@example.co.jp`
- **AND** no unmasked customer file is written to the local filesystem

### Requirement: Cloud drive size limits and error isolation

Cloud drive connectors MUST enforce `extraction.maxFileSizeMb` before downloading remote file bytes and SHALL report auth, rate-limit, or corrupt-download failures as actionable issues without crashing other sources in `knot-sync run`.

#### Scenario: Oversized remote file is skipped before download
- **GIVEN** a `onedrive` file whose reported `size` exceeds `extraction.maxFileSizeMb`
- **WHEN** `knot-sync run` processes that entry
- **THEN** `SKIPPED_TOO_LARGE` is recorded without downloading the file body
- **AND** remaining files still extract and `knot-sync run` exits 0
