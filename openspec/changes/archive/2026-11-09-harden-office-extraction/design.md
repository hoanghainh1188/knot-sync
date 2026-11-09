# Design

## Context

See proposal.md — Why. Today `extractOfficeFile` always `readFile`s the whole
path into a `Buffer`, loads `.xlsx` via `workbook.xlsx.load(bytes)`, and decodes
entire CSV/TXT strings. `ExtractContext` already allows `signal?: AbortSignal`
but the CLI does not set a timeout. Config has no `extraction` section;
`CORE_TOP_LEVEL_KEYS` must gain `extraction` so it is not treated as a plugin bag.

Read-only / local guarantees: only `readFile` / stream-read of source paths;
no writes into sources; no network.

## Goals / Non-Goals

**Goals:**

- Hard caps on file size and wall-clock extract time with soft-fail issues.
- Bound RAM for large xlsx and large delimited/plain text.
- Config defaults usable without editing (`50` MB / `30` s).

**Non-Goals:**

- Perfect cancellation of native/library work that ignores AbortSignal (best
  effort: abandon result after timeout and continue the run).
- Parallel multi-file extraction or worker threads.
- Changing Document schema beyond optional truncation metadata.

## Decisions

### 1. Config shape

```yaml
extraction:
  maxFileSizeMb: 50      # default
  timeoutSeconds: 30     # default
  maxTextChars: 500000   # default (~500k chars); chunk/truncate delimited & txt/md
```

Parse in `packages/core` like `cleaning`/`pii`. Starter config gets commented
block. `maxTextChars` is the “token threshold” proxy (no tokenizer dependency).

### 2. Where size/timeout live

- **Size:** CLI `run` (or extractor entry) checks `file.size` from inventory
  when available; if missing, `stat` once. Over limit → issue
  `SKIPPED_TOO_LARGE`, skip `extract`. Optionally `scan` can also emit the same
  code for visibility; not required if inventory already exposes size in the
  HTML report.
- **Timeout:** CLI wraps `extractor.extract(file, { signal })` with
  `AbortSignal.timeout(ms)` (Node 22) or `Promise.race`. On timeout → issue
  `EXTRACT_TIMEOUT`, continue. Extractor SHOULD abort incremental work when
  `signal.aborted` where feasible (xlsx stream loop, line reader).

### 3. Xlsx streaming

Try ExcelJS `stream.xlsx.WorkbookReader` first (path-based, no full buffer).
If the stream path fails (ExcelJS 4.4 can throw when `workbook.model` is not
ready for some zips), **fall back** to `xlsx.load(buffer)`. Peak memory for
the buffer path remains bounded by `extraction.maxFileSizeMb` (oversized files
never load). Hidden-cell heuristics are best-effort on both paths.

### 4. Delimited / plain chunking

- Open a read stream (or decode in slices).
- Accumulate lines/chars up to `maxTextChars`.
- Build table/markdown from the accepted portion; set
  `metadata.truncated: true` (or similar) and/or append a clear note in content
  when truncated.
- Do not keep the discarded tail in memory.

### 5. Issue codes

| Code | When |
|---|---|
| `SKIPPED_TOO_LARGE` | size > maxFileSizeMb |
| `EXTRACT_TIMEOUT` | timeout fired |
| existing `READ` / `PARSE` / … | unchanged |

## Risks / Trade-offs

- **[Risk] ExcelJS stream API shape differs from buffer load** → Mitigation:
  fixture tests for JP sheet names; golden small workbook both before/after.
- **[Risk] Timeout cannot kill stuck native code** → Mitigation: soft-fail and
  continue; document that operators should raise `timeoutSeconds` or exclude
  the file.
- **[Risk] Truncation loses tail of CSV** → Mitigation: metadata + issue or
  progress message; operator can raise `maxTextChars` or split files.
- **[Risk] Dual path for hidden cells** → Prefer stream-only; accept weaker
  hidden detection if styles unavailable.

## Migration Plan

1. Ship defaults; existing configs keep working.
2. Operators with huge files see `SKIPPED_TOO_LARGE` / timeouts instead of
   process death; adjust `extraction:` as needed.
3. No store migration.

## Open Questions

None material — defaults (`50` / `30` / `500000`) are fixed for apply unless
reviewers ask to change them before coding.
