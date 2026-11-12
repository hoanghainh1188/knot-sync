# Proposal: Expand UI with Document Explorer & Health

## Why

Today `knot-sync ui` only exposes the Semantic Catalog editor, forcing PMs and IT admins to inspect CLI stdout, HTML reports, or raw JSONL logs to see which documents were indexed, which PII/injection findings were flagged, and which files failed during `scan` or `run`. Adding a strictly read-only **Documents & Health** tab alongside Semantic Catalog review gives non-CLI stakeholders immediate visibility into extracted corpus health without ever exposing unmasked PII or writing to customer sources.

## What Changes

- Persist latest extraction/`run` issues in `@hoanghainh/knot-sync-store-sqlite` (`run_issues` table) alongside existing `scan_issues`, and add read-only query helpers on `Store` for paginated/filtered sanitized document browsing, source health stats, and scan/run issues.
- Update `runSyncPass` in `packages/cli/src/sync-cycle.ts` to persist its collected `run` issues to `Store` on completion (non-aborted or partial pass).
- Update `cmdUi` (`packages/cli/src/main.ts`) to pass `config.store.path` into `createUiServer`, keeping `storePath` optional for backwards compatibility.
- Add read-only `GET /api/documents` and `GET /api/health-summary` endpoints in `packages/ui/src/server.ts` (loopback-only `127.0.0.1`), projecting ONLY sanitized document fields (never `metadata.originalContent`, `metadata.originalTables`, or raw matched PII strings) and gracefully returning empty state when no SQLite store exists yet.
- Expand the bundled React UI (`packages/ui/src/client/`) with top-level tab navigation (**Catalog Review** | **Documents & Health**) localized across `en`, `ja`, and `vi`, supporting:
  - Search by keyword (`q`), filter by `sourceId`, document `type`, and guard risk (`low` / `medium` / `high`).
  - Document table & detail drawer showing title, source, type, sanitized text snippet, PII badge counts/types, and guard risk/findings.
  - Health summary cards & scan/run issue table per source (duplicates, old files, empty files, scan/run issue codes and messages).
- Update `README.md` and `docs/ROADMAP.md` (`expand-ui-document-explorer` status).

### Out of Scope

- Editing, deleting, re-running, or downloading raw/unmasked documents from the UI (deferred / violates read-only and PII safety guarantees).
- Triggering `scan`, `run`, `embed`, or Paid OCR/LLM pipelines from the browser UI (CLI & periodic sync own pipeline execution).
- Paid-only RBAC/OAuth login UI or license management panels (UI stays `127.0.0.1` loopback-only).
- Write-back tools to customer folders or databases (deferred to v1.1+ after human-approval design).

## Capabilities

### New Capabilities

- _(None — extends the existing `catalog-review-ui` local loopback UI capability.)_

### Modified Capabilities

- `catalog-review-ui`: Add a read-only **Documents & Health** tab, sanitized document search/filter/detail endpoints, scan/run issue visibility, and `en`/`ja`/`vi` UI chrome localization while preserving `127.0.0.1` loopback binding, zero CDN, and zero unmasked PII / customer-source writes.

## Dependencies

- **None** — Zero new third-party dependencies. Uses existing `@hoanghainh/knot-sync-store-sqlite` (`node:sqlite`), `react`, `react-dom`, and `vite`.

## Impact

- **`packages/store-sqlite`**: New `run_issues` table + read-only query helpers (`replaceRunIssues`, `listRunIssues`, `listScanIssues`, `listDocumentSummaries`, `getDocumentSanitized`).
- **`packages/cli`**: Persist `run` issues in `sync-cycle.ts` and pass `storePath` to `createUiServer` in `main.ts`.
- **`packages/ui`**: Read-only `GET /api/documents` & `GET /api/health-summary` routes, optional `storePath` in `CreateUiServerOptions`, React Documents & Health tab, `en`/`ja`/`vi` chrome strings in `chrome-i18n.ts`.
- **Docs**: `README.md` (`packages/cli/README.md` synced via `bundle:cli`) and `docs/ROADMAP.md`.
