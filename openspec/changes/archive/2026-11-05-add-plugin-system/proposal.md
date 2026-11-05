# Proposal

## Why

Every later v0.1 pipeline feature (extractors, cleaners, PII/guard rules, SQL
connectors, MCP tools) must plug into one shared extension model. Without a
plugin API first, those features would be hard-wired into the CLI and paid
packages could not ship separately. This change is the foundation required by
the roadmap before any further pipeline work.

## What Changes

- Add a plugin API in `packages/core`: typed registries and a `register(api)`
  contract for extension points `connector`, `extractor`, `cleaner`, `pii-rule`,
  `guard-rule`, `catalog-source`, `mcp-tool`, and `mcp-prompt`.
- Load plugins in the CLI from config `plugins:` (npm package names or relative
  file paths). Only listed plugins load; never auto-discover from disk or the
  network. Built-in features are default plugins always loaded unless the design
  documents an explicit opt-out.
- **BREAKING (config semantics):** source `type` resolves through the connector
  registry instead of a hard-coded `fs` check. Unknown types fail with the list
  of registered connector ids.
- Turn the existing folder walker into the built-in `fs` connector plugin
  (same read-only behavior; registration path changes).
- Reject plugins with incompatible `apiVersion` or duplicate extension ids with
  a clear error that says what to do next.
- Add `knot-sync plugins` to list loaded plugins and their registered extension
  points.
- Plugin-specific settings live under the plugin's own config key and are
  validated by the plugin.
- Document that plugins run in-process with full trust (install only trusted
  plugins) and that paid plugins check their own license key (core never does).
- Add an example plugin under `examples/plugins/` (e.g. a custom PII rule) with
  tests.

### Out of scope

- Implementing real extractors, cleaners, PII/guard rules, catalog, or MCP
  tools beyond empty typed registries and the `fs` connector.
- Plugin sandboxing, process isolation, or signature verification (v0.2+).
- Auto-discovery of plugins from `node_modules` or a plugins folder.
- License-key checks in core; HTTP transport / OAuth (paid).
- Web UI plugin management (v0.2).
- New third-party dependencies (none).

## Capabilities

### New Capabilities

- `plugin-system`: Plugin module contract, loading rules, typed registries,
  version/duplicate rejection, built-in defaults, and the `plugins` CLI command.

### Modified Capabilities

- `config`: Source `type` is resolved via the connector registry; config gains
  a `plugins:` list and reserved keys for plugin-owned settings. Starter config
  and error messages update accordingly.

## Impact

- **Code:** `packages/core` (new plugin API + types), `packages/connector-fs`
  (export as connector plugin), `packages/cli` (load plugins, resolve connectors
  in `scan`, new `plugins` command), `examples/plugins/` (sample plugin).
- **Config:** existing configs with `type: fs` keep working once the built-in
  `fs` connector is registered; configs with unknown types get a clearer error.
- **Specs:** existing `folder-source`, `scan-report`, and `document-search`
  requirements stay; scan continues to use the same inventory/store path.
- **Dependencies:** none new.
- **Docs:** README and `docs/ROADMAP.md` status for this change.
