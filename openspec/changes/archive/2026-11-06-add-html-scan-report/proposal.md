# Proposal

## Why

Non-technical managers at Japanese and Vietnamese customers need a shareable
scan health summary they can open offline—without reading CLI text or JSON.
`scan --report` is already reserved in help as “coming soon”; this change
delivers one self-contained HTML file they can email or archive.

## What Changes

- New package `packages/report-html` (`@hoanghainh/knot-sync-report-html`) that
  turns scan results into **one** self-contained HTML document (inline CSS/JS,
  no external assets, works offline, light and dark mode).
- `knot-sync scan --report [file]` writes that HTML after a successful scan.
  When the path is omitted, a documented default filename next to the config or
  CWD is used. Terminal text/`--json` output remain unchanged.
- Report content mirrors the scan health summary: totals, by type, duplicates
  (top groups), old / empty / unreadable files, and PII estimate **when**
  `--pii` was also used (omit or show “not estimated” when absent).
- In-page language switch for labels: English, Japanese, Vietnamese (audience:
  non-technical managers). Default language is English unless design picks a
  better default.
- **No charting library** and **no new third-party dependencies** (string
  templates + Node `fs` only; workspace dep on core types as needed).

### Out of scope

- Hosted / CDN report hosting or email delivery.
- Interactive charts, map visualizations, or paid branding skins.
- Writing reports into customer **source** folders (must stay read-only).
- MCP or Semantic Catalog surfaces (`add-mcp-server`, `add-semantic-catalog`).
- Guard-risk dashboards beyond what scan already exposes (none today).

## Capabilities

### New Capabilities

- `html-scan-report`: generate and write the offline trilingual HTML scan
  report from in-memory scan results.

### Modified Capabilities

- `scan-report`: `scan --report [file]` writes the HTML report; help text no
  longer says “coming soon”.

## Impact

- **Code:** `report-html` package; CLI `scan` option parsing (string path) and
  write path outside sources; README / ROADMAP.
- **Deps:** none new.
- **Docs:** README examples for `--report` and default path.
