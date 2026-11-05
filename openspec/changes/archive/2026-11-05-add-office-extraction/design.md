# Design

## Context

See proposal.md for motivation. After `add-plugin-system`, `Extractor` is a
stub `{ id }`. The store already has `documents` + FTS and `upsertDocument`, but
no API to list inventory rows for `run`. Sources remain read-only; extraction
only reads bytes.

## Goals / Non-Goals

**Goals:**

- Callable `Extractor` interface + built-in office/text plugin.
- `knot-sync run` pipeline: inventory → match extractor → upsert Document.
- Incremental skip via inventory file hash vs document metadata.
- Per-file failures become issues; run continues.

**Non-Goals:**

- Cleaning / PII / guard steps on `run` (later changes).
- OCR, binary Office, 方眼紙.
- CLI search command (MCP later).

## Decisions

### 1. Widen `Extractor` in core

```
id: string
extensions: string[]   // lower-case with dot, e.g. ".xlsx"
extract(file: FileEntry, ctx: ExtractContext): Promise<ExtractResult>
```

`ExtractResult` = `{ ok: true, document: Document } | { ok: false, code, message }`.
Document `id` = existing `documentId(sourceId, relPath)`. Document `hash` =
hash of normalized content (unchanged meaning). Store source inventory hash in
`metadata.sourceFileHash` for incremental compare.

**Alternative:** one extractor per format — rejected; one plugin registering one
(or few) extractors keeps `plugins` listing simple for v0.1.

### 2. Package `extractor-office` as default plugin

Built-in next to `fs` in CLI `BUILTIN_PLUGINS`. Internals:

| Ext | Library | Notes |
|---|---|---|
| `.xlsx` | exceljs | sheets → Markdown + `tables` |
| `.docx` | mammoth | `convertToMarkdown` |
| `.pdf` | unpdf | text extract; empty/fail → issue (no OCR) |
| `.csv`/`.tsv` | Node | parse rows → table + Markdown |
| `.txt`/`.md` | Node | UTF-8 read; invalid encoding → issue |

No new native deps. Pin versions compatible with Node >= 22.13 ESM.

### 3. Store inventory listing

Add `Store.listFiles(sourceId?: string): FileEntry[]` (or async iterator) reading
the `files` table. Add `getDocumentBySourcePath(sourceId, relPath)` via
`documentId` + `getDocument`, or compare `metadata.sourceFileHash` after get.

Optional `listRunIssues` / replace run issues table — keep simple: print issues
to stderr/stdout summary and do not require a new table in v0.1 (scan_issues
stays scan-only). Run issues are session-local in the CLI summary unless we add
`run_issues` — prefer session summary only to avoid schema churn.

### 4. Incremental skip

For each inventory file with a matching extractor:

1. If `file.hash` is null, always extract (hashing disabled).
2. Else load existing doc by `documentId`; if
   `doc.metadata.sourceFileHash === file.hash`, skip.
3. Else extract, set `metadata.sourceFileHash = file.hash`, upsert.

### 5. Matching extractors

First registered extractor whose `extensions` contains `file.ext` wins. If none,
record “unsupported” issue and continue.

### 6. Read-only / local

Extractors use `fs.readFile` / library open on `file.absPath` only. No writes
under source roots. Libraries are local npm deps; no network at runtime.

### 7. Tests generate real fixtures

Build minimal valid `.xlsx`/`.docx`/PDF/CSV in temp dirs inside tests (exceljs /
mammoth / simple PDF bytes). Do not rely on `examples/sample-data` fake bytes
for happy-path extraction.

## Risks / Trade-offs

- **[Risk] unpdf / PDF edge cases** → Mitigation: treat empty text and parse
  errors as issues; document “text-based PDF only”.
- **[Risk] Large xlsx memory** → Mitigation: accept exceljs defaults for v0.1;
  stream later if needed.
- **[Trade-off] No persistent run_issues table** → Simpler schema; operators see
  CLI summary only until a later change.

## Migration Plan

1. Ship with built-in extractor always loaded; existing configs unchanged.
2. Users run `scan` then `run`; search index fills.
3. Rollback: revert package + CLI wiring; store documents table may retain rows
   (harmless).

## Open Questions

None blocking. Exact CLI summary wording can follow `scan` formatting style
during apply.
