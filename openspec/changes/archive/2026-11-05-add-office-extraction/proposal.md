# Proposal

## Why

`scan` only inventories files. AI agents need document text and tables in the
store before MCP search is useful. The plugin system is in place, so extraction
must land as a built-in extractor plugin plus a `run` command that fills the
Document store from the last inventory.

## What Changes

- New package `packages/extractor-office` (`@hoanghainh/knot-sync-extractor-office`):
  built-in extractor plugin that turns `.xlsx`, `.docx`, text-based `.pdf`,
  `.csv`/`.tsv`, `.txt` and `.md` into `Document` values (Markdown content,
  tables as headers+rows).
- Widen the core `Extractor` interface so plugins can declare supported types
  and extract from a `FileEntry` (read-only file access).
- Implement `knot-sync run`: load plugins, read the inventory from the last
  `scan`, extract eligible files, upsert documents so document-search finds
  them. Skip re-extraction when the inventory file hash matches the hash stored
  with the existing document. Unsupported or broken files become run issues,
  never crash the whole run.
- Add store helpers to list inventory files and look up documents by source
  location for incremental runs.
- Dependencies (MIT / BSD only): `exceljs` (MIT), `mammoth` (BSD-2-Clause),
  `unpdf` (MIT).

### Out of scope

- OCR for scanned PDFs or images (paid / later).
- Old binary `.xls` / `.doc` formats.
- 方眼紙 Excel layout detection (paid).
- Cleaning, PII masking, injection guard (later v0.1 changes on `run`).
- MCP `serve` (still unavailable).
- Changing folder-source read-only rules.

## Capabilities

### New Capabilities

- `document-extraction`: Built-in office/text extractors and the `run` command
  that turns inventory files into stored Documents with incremental skip and
  per-file issue reporting.

### Modified Capabilities

- `scan-report`: `run` is no longer a “coming soon” command; only `serve`
  remains unavailable among previously stubbed commands.
- `plugin-system`: Extractor registrations are callable (supported types +
  extract), not empty stubs.

## Impact

- **Code:** new `packages/extractor-office`; `packages/core` Extractor types;
  `packages/store-sqlite` inventory listing / incremental helpers; `packages/cli`
  `run` command and built-in plugin list; root `tsconfig` / workspace.
- **Config:** no new required keys; extractors load as built-in plugins.
- **Docs:** README and `docs/ROADMAP.md` status.
- **Dependencies:** exceljs (MIT), mammoth (BSD-2-Clause), unpdf (MIT) — listed
  in this proposal for approval.
