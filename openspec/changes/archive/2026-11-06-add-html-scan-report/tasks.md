# Tasks

## 1. report-html package

- [x] 1.1 Create `packages/report-html` (`@hoanghainh/knot-sync-report-html`) with workspace wiring; **no third-party runtime deps**; export `renderScanReportHtml` + DTO types
- [x] 1.2 Implement self-contained HTML: escape paths, by-type / duplicates / old / empty / issues, optional PII, inline CSS light+dark, EN/JA/VI dictionary + language switch; verify with `pnpm test` (string assertions, no browser required)

## 2. CLI `scan --report`

- [x] 2.1 Parse `--report [file]` (default `./knot-sync-scan-report.html`); refuse paths under configured sources; write after successful scan; update help (remove “coming soon”)
- [x] 2.2 CLI tests: default and custom path, HTML contains JP path from fixture, no write inside source; verify with `pnpm test`

## 3. Docs and final check

- [x] 3.1 Update README.md (`--report`) and mark `add-html-scan-report` done in `docs/ROADMAP.md`
- [x] 3.2 Full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-html-scan-report` after review.
- Commit on a feature branch and open a PR into `main`.
