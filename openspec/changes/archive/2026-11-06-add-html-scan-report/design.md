# Design: add-html-scan-report

## Context

`knot-sync scan` already builds per-source stats, top duplicate groups, issues,
and optional `piiLikelyFiles`. CLI help still advertises `--report` as coming
soon (boolean stub). See proposal.md for motivation. Constraints: read-only
sources, fully local (no network at runtime), no new third-party deps, no
charting library.

## Goals / Non-Goals

**Goals**

- `packages/report-html` renders one offline HTML string from scan results.
- CLI `--report [file]` writes that file outside sources; default path documented.
- EN/JA/VI labels with in-page switch; light/dark via CSS.

**Non-Goals**

- Plugin-host registration for report writers (CLI can import the package
  directly like format helpers; optional later plugin point).
- Streaming multi-file report packs.

## Decisions

### 1. Package API

```ts
export interface HtmlReportInput {
  version: string;
  storePath: string;
  generatedAt: string; // ISO
  sources: Array<{
    stats: SourceStats; // from store-sqlite / shared shape
    issues: ScanIssue[];
    topDuplicates: DuplicateGroup[];
    piiLikelyFiles?: number;
  }>;
  oldFileYears: number;
}

export function renderScanReportHtml(input: HtmlReportInput): string;
```

Package depends only on `@hoanghainh/knot-sync-core` if shared types are needed;
otherwise keep a local DTO mirrored from CLI scan output to avoid a
store-sqlite dependency from report-html (**decision:** define a small DTO in
`report-html` and map in the CLI so report-html stays free of sqlite).

### 2. CLI `--report` parsing

`node:util` `parseArgs` does not support optional option-arguments cleanly.
**Decision:** use `report: { type: "string" }` and treat:

- `--report` alone → many Node versions require a value; if missing value fails
  parse, accept `--report=` empty or a sentinel.

Practical approach matching roadmap `scan --report [file]`:

1. Prefer `report: { type: "string" }` with default when flag present.
2. Document usage as `scan --report` writing default via a second boolean
   **or** `scan --report <path>`.

**Chosen:** `report: { type: "string" }` where:

- User passes `--report path.html` → write there (resolve relative to CWD).
- User passes `--report` with value `.` or empty not allowed; for bare flag,
  support both `--report` by also accepting a boolean alias is messy.

Simplest reliable UX for Node parseArgs: require path OR use default when the
string is the literal `true` from some parsers — **instead:** document

```
--report [file]   Write HTML report (default: ./knot-sync-scan-report.html)
```

and implement by scanning `argv` for `--report` / `--report=file` before
parseArgs, or use `parseArgs` with `report: { type: "string", default:
undefined }` and if `--report` appears without value, inject the default path
in a tiny argv preprocess.

CLI prints the written absolute path on stderr or stdout (one line) after
success so operators know where the file is; does not dump HTML to stdout.

### 3. Default path

Default: `./knot-sync-scan-report.html` relative to **process CWD** (not inside
source paths). Refuse to write if the resolved path is inside any configured
`source.path` (prefix check after `realpath` when possible).

### 4. HTML structure

- Semantic sections per source; tables for by-type and duplicates.
- Escape all customer path/title strings (`& < > " '`).
- i18n dictionary object in inline `<script>`; `data-i18n` keys on labels;
  buttons EN | 日本語 | Tiếng Việt; persist choice in `localStorage` key
  `knot-sync-report-lang` (local only, still offline).
- Default language: English.
- CSS variables; `@media (prefers-color-scheme: dark)` plus optional toggle
  class on `<html>`.

### 5. Read-only / local

- Report writer only `writeFile`s the chosen report path (create parent dirs if
  needed). Never writes under source roots.
- HTML has no outbound fetch; works offline.
- No telemetry.

### 6. Wiring

Not a pipeline plugin for v0.1; CLI imports `renderScanReportHtml` after scan
aggregation (same data as `--json`). Keep built-in list unchanged.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Huge duplicate path lists | Cap top groups (reuse scan’s top 5) |
| HTML injection via paths | Escape all dynamic text |
| Accidental write into source | Path guard against source prefixes |
| parseArgs optional value pain | Argv preprocess + tests for bare `--report` |

## Migration Plan

- Replace “coming soon” stub; old configs unaffected.
- Rollback: remove package/wiring; `--report` can return to stub if needed.
