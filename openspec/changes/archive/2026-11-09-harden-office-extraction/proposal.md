# Proposal

## Why

`knot-sync run` currently loads entire office/text files into memory and parses
them without a size gate or per-file timeout. Large customer `.xlsx` / CSV
dumps can OOM the process or hang indefinitely, taking down a whole run. This
is the P0 production-readiness item for v0.3: make extraction fail soft and
bound resource use while keeping sources read-only and fully local.

## What Changes

- Add config section `extraction:` with at least:
  - `maxFileSizeMb` (default **50**)
  - `timeoutSeconds` (default **30**)
  - bounded-text controls for delimited/plain files (exact keys in design)
- Skip files over the size limit with issue code **`SKIPPED_TOO_LARGE`**
  (actionable message); do **not** abort `scan` or `run`.
- Apply a per-file extraction timeout (AbortSignal / Promise.race); timed-out
  files become run issues and the run continues.
- Parse large `.xlsx` via ExcelJS **streaming** reader so RAM stays bounded.
- Stream/chunk large `.csv` / `.tsv` / `.txt` (and similar delimited/plain
  paths) instead of decoding the entire buffer when over configured limits;
  preserve Japanese/Vietnamese text correctness for fixtures within limits.
- Wire defaults into starter config comments / docs; update tests and roadmap
  status.

Out of scope:

- OCR / scanned PDF (paid), 方眼紙 Excel (paid), old `.xls`/`.doc`.
- Other v0.3 items: `harden-sql-connector`, `add-http-mcp-transport`,
  `enhance-pii-guard`, `scale-sqlite-store`, system logs.
- Changing MCP tool contracts, catalog, or PII/guard rule sets.
- New third-party dependencies: **none** (ExcelJS already present; Node
  built-ins for streaming/timeouts).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `document-extraction`: size skip, timeout, streaming xlsx, chunked
  delimited/plain extraction; soft-fail issue codes.
- `config`: optional `extraction` section with defaults and validation.

## Impact

- `packages/core` (config types/parser, reserved keys, starter YAML)
- `packages/extractor-office` (xlsx stream path, size/timeout/chunking)
- `packages/cli` (`run` / possibly `scan` reporting for oversized files)
- Tests under extractor-office + core config; README / `docs/ROADMAP.md`
