# Proposal

## Why

Open-core v0.1–v0.3 and Paid #1–#7 are shipped, but there is no single
documented **1.0 public contract**. Operators and plugin authors cannot tell
which CLI commands, config keys, MCP names, and plugin `apiVersion` are stable
versus fair game to change. Separately, the npm page still leaves room to
misread Paid plugins as separate registry packages, even though only
`@hoanghainh/knot-sync` is published.

## What Changes

- Add a **public-contract** capability that freezes the 1.0 read-only surface:
  CLI commands/flags, top-level config keys, MCP resource URIs and tool names,
  and plugin host `apiVersion` `1`, with a clear SemVer rule (breaking → 2.0)
- Strengthen **npm / product docs** so Paid #1–#7 are explicitly **not**
  published as separate npm packages; enablement is monorepo `plugins:` paths
  plus each plugin’s license env var
- Mirror that Paid distribution note in **ja/vi** overviews and keep the
  English product README (packed into the CLI tarball) as the source of truth
- Add a short **stability** section (or equivalent) to README / ROADMAP that
  points to the frozen surface without tagging `v1.0.0` in this change

**Out of scope**

- Tagging or publishing `@hoanghainh/knot-sync@1.0.0` (deferred until a real
  customer pilot — roadmap item 2)
- Write tools / stored procedures (After v1.0)
- Changing runtime CLI, MCP, or plugin behavior (docs + contract specs only)
- Publishing paid packages to the npm registry
- New third-party dependencies (none)

## Capabilities

### New Capabilities

- `public-contract`: durable inventory of the 1.0-stable CLI, config, MCP, and
  plugin-host surface, plus SemVer compatibility rules for that surface

### Modified Capabilities

- `npm-release`: require product README to state that only
  `@hoanghainh/knot-sync` is on npm and that Paid plugins stay private monorepo
  packages enabled via `plugins:` + license env (not separate registry packages)
- `docs-i18n`: Japanese and Vietnamese overviews MUST include the same Paid
  distribution clarification (not on npm; enable from repo + license env)
- `plugin-system` (light): document that host `PLUGIN_API_VERSION` `1` is the
  1.0 plugin contract; incompatible plugins still fail with the existing
  actionable error

## Impact

- Docs: root `README.md`, `packages/cli/README.md` (synced product README),
  `docs/ja/README.md`, `docs/vi/README.md`, `docs/ROADMAP.md`, `CHANGELOG.md`
  note for the docs-only prep (no version bump required)
- Specs: new `public-contract`; deltas on `npm-release`, `docs-i18n`,
  `plugin-system`
- Code: none required beyond optional tiny doc-string / comment alignment if
  already present; no new dependencies
- Runtime / MCP / store: unchanged; still read-only to sources; free core still
  makes no outbound network calls
