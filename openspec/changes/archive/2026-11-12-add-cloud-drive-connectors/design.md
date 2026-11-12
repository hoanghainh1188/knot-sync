# Design

## Context

See `proposal.md` for motivation and scope. Currently `Connector` in `packages/core/src/plugin.ts` yields `FileEntry` records whose `absPath` is read directly from the local filesystem by `packages/extractor-office` during `knot-sync run`. Cloud drive files do not live on the local filesystem, and writing unmasked remote files to local temp directories would risk leaking raw PII outside the store.

## Goals / Non-Goals

**Goals:**
- Implement `packages/connector-cloud-drive` (`gdrive`, `sharepoint`, `onedrive`) with zero third-party runtime dependencies using Node.js >= 22.13 `fetch` and `node:crypto`.
- Keep all customer cloud sources strictly read-only and keep `knot-sync serve` (MCP) 100% local against the SQLite store (outbound HTTPS calls happen only during operator-triggered `scan` / `run`).
- Stream/load remote bytes in memory via optional `Connector.readBytes` -> `ExtractContext.readBytes`, enforcing `extraction.maxFileSizeMb` before downloading.
- Gate `scan` and `readBytes` on offline Ed25519 license verification via `@hoanghainh/knot-sync-plugin-license`.

**Non-Goals:**
- Interactive browser OAuth consent flows or local token-cache servers.
- Downloading or indexing Google Drive comments/revisions or SharePoint list items (files and Google Workspace Docs/Sheets/Slides only).

## Decisions

### 1. Zero-dependency REST clients (`fetch` + `node:crypto`)
- **Decision:** Implement minimal Google Drive v3 and Microsoft Graph v1.0 REST clients directly using Node.js built-in `fetch` and `node:crypto` (RS256 JWT assertion for Google Service Accounts; OAuth2 `refresh_token` or `client_credentials` grant over HTTPS).
- **Rationale:** Avoids pulling heavy SDK trees (`googleapis`, `@azure/identity`, `@microsoft/microsoft-graph-client`) and keeps license checks and bundle sizes minimal.
- **Alternative considered:** Installing `googleapis` and `@microsoft/microsoft-graph-client` — rejected due to hundreds of transitive dependencies.

### 2. In-memory `readBytes` hook on `Connector` and `ExtractContext`
- **Decision:** Add optional `readBytes?(file: FileEntry, signal?: AbortSignal): Promise<Buffer>` on `Connector` and `readBytes?: (file: FileEntry) => Promise<Buffer>` on `ExtractContext`. `packages/cli/src/sync-cycle.ts` wires the source connector's `readBytes` into `ExtractContext`, and `packages/extractor-office` prefers `ctx?.readBytes(file)` over `fs.readFile(file.absPath)`.
- **Rationale:** Zero disk writes for unmasked remote files; preserves `maxFileSizeMb` check before downloading and `timeoutSeconds` via `AbortSignal`.
- **Alternative considered:** Downloading to a temp directory — rejected because unmasked PII would touch disk and require cleanup guarantees on crash.

### 3. Google Workspace export & remote hashing
- **Decision:** Map Google Docs (`application/vnd.google-apps.document`) -> `.docx`, Google Sheets (`...spreadsheet`) -> `.xlsx`, Google Slides (`...presentation`) -> `.pdf` during `scan` so `extractor-office` matches them automatically. Use `md5Checksum` (or `modifiedTime` for native Google Workspace docs / Graph `eTag` + `lastModifiedDateTime`) as `FileEntry.hash`.
- **Rationale:** Reuses existing incremental skip and stale-document pruning in `sync-cycle.ts` without special-casing cloud sources.

### 4. Read-only & Fully-local Guarantees
- **Read-only:** Connectors only request read-only scopes (`https://www.googleapis.com/auth/drive.readonly`, `Files.Read.All`, `Sites.Read.All`) and only issue `GET` (and token-exchange `POST` to OAuth endpoints) requests; never `POST`/`PATCH`/`DELETE` on drive resources.
- **Fully-local:** Outbound HTTPS requests occur strictly when the operator invokes `scan` or `run` on a configured cloud source. `knot-sync serve` (MCP) never calls cloud APIs and serves only cleaned, PII-masked data from the local SQLite store. Secrets are read exclusively from environment variables referenced by name in config.

## Risks / Trade-offs

- **Large Google Workspace exports (no `size` field reported in Drive metadata)** → Enforce a byte-stream cap inside `readBytes` against `maxFileSizeMb` so an oversized export aborts early with `SKIPPED_TOO_LARGE`.
- **API rate limiting (`429` / `503`) on large shared drives** → Respect `Retry-After` (bounded retries) and soft-fail individual file downloads as `RunIssue` records so one transient error does not abort the entire `run`.
- **Token expiry during long `run`** → Cache access tokens in memory with expiry margin (e.g., 60s) and refresh transparently on expiry.
