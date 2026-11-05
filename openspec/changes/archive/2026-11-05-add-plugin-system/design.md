# Design

## Context

Today `packages/cli` imports `scanFs` directly and `packages/core` config
hard-codes `type === "fs"`. See proposal.md for why that must become a plugin
model before further pipeline work. Constraints that shape this design: no new
dependencies, Node >= 22.13 ESM (`NodeNext`), read-only sources, no network at
runtime, plugins in-process with full trust.

## Goals / Non-Goals

**Goals:**

- One host API in core that later packages register into without editing the CLI
  for each feature.
- Built-in `fs` connector keeps current scan behavior for existing configs.
- Clear load failures (bad apiVersion, duplicate ids, missing module).
- `knot-sync plugins` for inspectability.

**Non-Goals:**

- Sandboxing, code signing, or remote plugin download.
- Implementing extractor/cleaner/PII/MCP logic beyond typed stub registries.
- Changing folder-source or document-search behavioral requirements.

## Decisions

### 1. Plugin host lives in `packages/core`

Export `PLUGIN_API_VERSION`, `createPluginHost()`, registry types, and
`loadPlugins(...)` from core. The CLI calls load; packages like
`connector-fs` export a default plugin object the CLI registers as built-in.

**Alternative:** host only in CLI — rejected because paid/third-party plugins
would depend on the CLI package instead of the stable core API.

### 2. Dynamic import for listed plugins only

Resolve each `plugins:` entry to an absolute `file:` URL (relative to config
`baseDir`) or a bare specifier for `import()`. Built-ins are imported via static
workspace imports so the published CLI always includes `fs` without config.

**Alternative:** auto-scan `node_modules/@hoanghainh/*` — rejected (explicit
list, no surprise code).

### 3. Two-phase config: structural parse, then connector validate

1. Parse YAML: ids, store/scan defaults, `plugins:` list, opaque plugin keys.
2. Load built-ins + listed plugins into the host.
3. For each source, look up `type` in the connector registry and call
   `connector.parseSource(raw, ctx)` (or equivalent) so `fs` keeps path /
   extensions / exclude normalization.

This avoids circular "need connectors to parse config / need config to load
plugins" by letting structural config load first.

**Alternative:** keep hard-coded `fs` in `parseConfig` and only use registry at
scan time — rejected because unknown types would pass config then fail later,
and SQL connectors could not own their URL shape.

### 4. Connector interface (minimal for this change)

```
id: string
parseSource(raw, ctx) -> SourceConfig   // throws ConfigError
scan(source, options) -> AsyncIterable<FileEntry>
```

Other extension points (`extractor`, `cleaner`, …) are TypeScript interfaces +
empty `Map` registries with `registerX` / `getX` / `listX` so later changes add
implementations without widening the plugin contract again. Stubs need not be
callable from CLI yet.

### 5. Duplicate detection and apiVersion

`apiVersion` must equal `PLUGIN_API_VERSION` (start at `1`). Extension ids are
unique per registry; plugin `name` must also be unique among loaded plugins so
config keys map 1:1.

### 6. Example plugin as a relative `.mjs` file

`examples/plugins/mask-company-id.mjs` registers a no-op or identity `pii-rule`
with id `mask-company-id`, enough to prove loading + `plugins` listing + config
key hand-off. Tests import it through the real loader with a temp config.

### 7. Read-only and fully-local guarantees

- Plugin loading uses only local `import()` of listed paths/packages already on
  disk; no HTTP client, no telemetry.
- The built-in `fs` connector continues to use only `opendir` / `stat` / hash
  reads; the plugin API does not add write helpers for sources.
- Trust warning is documentation + help text, not a runtime network check.

## Risks / Trade-offs

- **[Risk] Malicious plugin has full process access** → Mitigation: explicit
  list, docs/help trust warning; sandbox deferred.
- **[Risk] Bare npm specifiers need the package installed next to the CLI** →
  Mitigation: document; relative file paths for examples and local paid plugins
  during development.
- **[Risk] Stub registries tempt incomplete later changes** → Mitigation:
  roadmap requires every new feature to register through these APIs; tasks add
  tests that registries exist and reject duplicates.
- **[Trade-off] Built-ins always on** → Simpler than opt-out flags; users cannot
  disable `fs` yet (acceptable for v0.1).

## Migration Plan

1. Ship with built-in `fs` always loaded → existing `type: fs` configs work
   unchanged.
2. Optional `plugins:` for extras; omit key = previous behavior.
3. Rollback: revert the change; configs without `plugins:` remain valid under
   the old hard-coded parser.

## Open Questions

None that block specs or tasks. Exact console formatting of `knot-sync plugins`
(table vs plain lines) can follow existing `format.ts` style during apply.
