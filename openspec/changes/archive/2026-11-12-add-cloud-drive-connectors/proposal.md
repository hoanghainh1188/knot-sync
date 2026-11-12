# Proposal

## Why

Enterprises in Japan and Vietnam store a large share of contracts, reports, and internal spreadsheets in **Google Drive**, **SharePoint**, and **OneDrive** alongside local file shares. Today KnotSync can only inventory and extract files from local filesystem folders (`fs`), forcing operators to manually mirror cloud folders before running `scan` and `run`. Adding a Paid plugin for read-only cloud drive connectors lets `knot-sync scan` and `knot-sync run` ingest cloud-hosted documents through the exact same local JA/VI cleaning, PII masking, and injection guard pipeline without writing unmasked customer files to disk.

## What Changes

- Add Paid plugin package `packages/connector-cloud-drive` (`@hoanghainh/knot-sync-connector-cloud-drive`, `private: true` in monorepo, bundled via Paid plugin distribution) registering three read-only `Connector` implementations (`gdrive`, `sharepoint`, `onedrive`) using Node.js built-in `fetch` and `node:crypto`.
- Gate `scan` and `readBytes` in `packages/connector-cloud-drive` behind offline Ed25519 license verification via `@hoanghainh/knot-sync-plugin-license` (`KNOT_SYNC_CLOUD_DRIVE_LICENSE`, with `KNOT_SYNC_ALLOW_TEST_LICENSE=1` test sentinel support in `node:test`), keeping `@hoanghainh/knot-sync-core` completely license-unaware.
- Add optional `readBytes?(file: FileEntry, signal?: AbortSignal): Promise<Buffer>` on `Connector` in `packages/core` and `readBytes?: (file: FileEntry) => Promise<Buffer>` on `ExtractContext` so `knot-sync run` and `packages/extractor-office` (plus `extractor-ocr` / `extractor-housen` when present) read remote file bytes in memory without creating unmasked temp files in customer sources.
- Support Google Workspace native files (Docs, Sheets, Slides) export to `.docx`, `.xlsx`, and `.pdf` during `scan`/`readBytes`, and incremental `scan` + stale document pruning using remote `md5Checksum` / `eTag` / `modifiedTime` hashes.
- Add mock-HTTP unit tests in `packages/connector-cloud-drive` and CLI end-to-end tests in `packages/cli` covering Japanese/Vietnamese filenames, PII masking, injection guard, `maxFileSizeMb` enforcement, and corrupt/auth-error handling.
- Update `docs/ROADMAP.md` and `README.md` (and sync `packages/cli/README.md`).

### Out of Scope
- Write, upload, move, rename, or delete operations on Google Drive, SharePoint, or OneDrive (strictly read-only).
- Interactive browser OAuth login flows (connectors use Service Account JWT / pre-configured OAuth2 refresh token or Microsoft Entra client credentials from environment variables).
- Kintone and Backlog connectors (separate future change under `enterprise-saas-connectors`).
- MCP `serve` making live network calls to cloud drives (MCP `serve` remains 100% local against the SQLite store).

### New Third-Party Dependencies
- None (0 new third-party packages; uses Node.js >= 22.13 built-in `fetch` and `node:crypto`).

## Capabilities

### New Capabilities
- `cloud-drive-connectors`: Paid opt-in plugin providing read-only `gdrive`, `sharepoint`, and `onedrive` connectors with env-based auth, Google Workspace export, in-memory `readBytes` extraction, Ed25519 offline license verification, and incremental hash/prune support.

### Modified Capabilities
<!-- No existing requirement semantics change; Connector.readBytes and ExtractContext.readBytes are additive optional hooks. -->

## Impact

- New package: `packages/connector-cloud-drive/` (`package.json`, `tsconfig.json`, `src/*`).
- Core & CLI: `packages/core/src/plugin.ts` (`Connector.readBytes`, `ExtractContext.readBytes`), `packages/cli/src/sync-cycle.ts` (`readBytes` wiring), `packages/extractor-office/src/extract.ts` (prefer `ctx?.readBytes` over `readFile(file.absPath)`).
- Packaging & scripts: `scripts/bundle-paid-plugins.mjs`, `scripts/check-licenses.mjs`, `tsconfig.json` project references.
- Docs: `README.md`, `packages/cli/README.md`, `docs/ROADMAP.md`.
