# Tasks

## 1. English product contract docs

- [x] 1.1 Add a **Public contract (toward 1.0)** section to root `README.md` listing stable CLI commands, noting stable MCP tools/resources and plugin `apiVersion` `1`, SemVer major-bump rule after 1.0.0, and that 1.0.0 is not claimed published while version &lt; 1.0.0; verify the section is present by reading the file
- [x] 1.2 Clarify the Paid plugins section in root `README.md`: Paid plugins are **not** separate npm packages; enable via monorepo `plugins:` + license env; core never checks licenses; verify the wording appears next to the existing plugin table
- [x] 1.3 Sync `packages/cli/README.md` with the same product README substance (or existing sync mechanism) so the packed npm README carries both sections; verify `packages/cli/README.md` contains the Paid-not-on-npm sentence
- [x] 1.4 Add or extend a `node:test` that reads the product README (or CLI-packaged README) and asserts presence of the stability heading / Paid-not-on-npm phrase; run `pnpm test` and confirm it passes

## 2. Locale docs (ja/vi)

- [x] 2.1 Update `docs/ja/README.md` with Paid distribution clarification (not separate npm packages; `plugins:` + license env) while keeping 読み取り専用; verify by reading the file
- [x] 2.2 Update `docs/vi/README.md` with the same Paid distribution clarification in Vietnamese while keeping nguồn chỉ đọc; verify by reading the file
- [x] 2.3 Add or extend a `node:test` that asserts both locale overviews mention Paid-not-on-npm (or documented Japanese/Vietnamese equivalents); run `pnpm test` and confirm it passes

## 3. Roadmap / changelog status

- [x] 3.1 Update `docs/ROADMAP.md` current-status line to mention `prepare-v1-public-contract` (docs freeze for 1.0 public surface + Paid npm clarity; tag 1.0.0 still after pilot); verify the status paragraph matches
- [x] 3.2 Optionally note the docs-only prep under `CHANGELOG.md` Unreleased (no version bump); verify no `1.0.0` release section is invented
- [x] 3.3 Add a short assert (same README/docs test file or adjacent) that ROADMAP status mentions public-contract prep or Paid npm clarity; run `pnpm test` after the group

## Workflow follow-up

- Archive with `/opsx:archive prepare-v1-public-contract` after review
- Do **not** tag or publish `1.0.0` in this change; that waits for a real pilot
