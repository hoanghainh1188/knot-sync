# Tasks

## 1. Core `readBytes` Hook & Package Scaffolding

- [x] 1.1 Add optional `readBytes?(file: FileEntry, signal?: AbortSignal): Promise<Buffer>` on `Connector` and `readBytes?: (file: FileEntry) => Promise<Buffer>` on `ExtractContext` in `packages/core/src/plugin.ts`; update `packages/extractor-office/src/extract.ts` and `packages/cli/src/sync-cycle.ts` to prefer `ctx.readBytes(file)` over local `fs.readFile` when provided; add unit tests verifying in-memory extraction without disk reads (`pnpm build && node --test packages/extractor-office/dist/*.test.js`).
- [x] 1.2 Scaffold `packages/connector-cloud-drive` (`package.json` with zero third-party deps, `tsconfig.json`, root `tsconfig.json` reference, `scripts/check-licenses.mjs`, `scripts/bundle-paid-plugins.mjs`) and verify `pnpm build && pnpm licenses:check` passes.

## 2. Paid Plugin, Ed25519 Licensing & Cloud Drive Connectors

- [x] 2.1 Implement offline Ed25519 license gating (`KNOT_SYNC_CLOUD_DRIVE_LICENSE`, `verifyPluginLicense`) and plugin registration (`connector:gdrive`, `connector:sharepoint`, `connector:onedrive`) in `packages/connector-cloud-drive/src/index.ts`; verify with `node:test` that missing/invalid tokens fail cleanly while valid/sentinel tokens register all three connectors.
- [x] 2.2 Implement read-only Google Drive v3 client (Service Account RS256 JWT & OAuth2 refresh token via `node:crypto`/`fetch`, `folder_id` traversal, Google Docs/Sheets/Slides export to `.docx`/`.xlsx`/`.pdf`, `md5Checksum`/`modifiedTime` hash, `maxFileSizeMb` cap) and verify with mock-HTTP `node:test` covering Japanese/Vietnamese filenames, exports, and oversized skips.
- [x] 2.3 Implement read-only Microsoft Graph v1.0 client for `sharepoint` and `onedrive` (client credentials grant, drive/folder traversal, `eTag`/`lastModifiedDateTime` hash, `readBytes` download, `Retry-After`/error isolation) and verify with mock-HTTP `node:test` (`node --test packages/connector-cloud-drive/dist/*.test.js`).

## 3. CLI Integration, Packaging & Documentation

- [x] 3.1 Add CLI `node:test` integration test in `packages/cli/src/` verifying `knot-sync scan` + `knot-sync run` + `Store.search` against mock `gdrive` and `onedrive` endpoints flows through JA/VI cleaning, PII masking, injection guard, incremental skip, and stale-doc pruning; run full workspace `pnpm test` and `pnpm bundle:cli`.
- [x] 3.2 Update `README.md` (Paid cloud drive connectors section), `docs/ROADMAP.md` (`enterprise-saas-connectors` progress), and `packages/connector-cloud-drive/README.md`, then run `pnpm bundle:cli` to sync `packages/cli/README.md`.
