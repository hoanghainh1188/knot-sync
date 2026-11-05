# Tasks

## 1. Plugin host API in core

- [x] 1.1 Add `PLUGIN_API_VERSION`, plugin module types (`name`, `version`, `apiVersion`, `register`), and typed stub registries for `connector`, `extractor`, `cleaner`, `pii-rule`, `guard-rule`, `catalog-source`, `mcp-tool`, `mcp-prompt` in `packages/core`; export them from the package entry
- [x] 1.2 Implement `createPluginHost()` / `loadPlugins()` that rejects incompatible `apiVersion`, duplicate plugin names, and duplicate extension ids with `ConfigError`-style messages that say what to do next
- [x] 1.3 Add `packages/core/src/plugin.test.ts` covering successful register, bad `apiVersion`, and duplicate id; verify with `pnpm test` for the core package tests

## 2. Built-in fs connector plugin

- [x] 2.1 Refactor `packages/connector-fs` to export a default plugin that registers connector id `fs` with `parseSource` (path/extensions/exclude normalization) and `scan` wrapping the existing walker
- [x] 2.2 Keep existing connector-fs walk tests green and add a test that the plugin registers `fs` on a fresh host; verify with `pnpm test`

## 3. Config: plugins list and deferred source types

- [x] 3.1 Extend config parsing to accept `plugins:` (unique strings, relative paths resolved from config dir) and preserve opaque top-level plugin settings keys
- [x] 3.2 Stop hard-coding allowed source types in the structural parse; validate each source through the connector registry after plugins load
- [x] 3.3 Update `packages/core` config tests for plugins list, duplicate plugin entries, opaque plugin keys, and unknown connector type after load; verify with `pnpm test`

## 4. CLI loading, scan via registry, plugins command

- [x] 4.1 On commands that need plugins (`scan`, `plugins`), load built-in defaults plus config `plugins:` via dynamic import; wire `scan` to the registered connector for each source
- [x] 4.2 Add `knot-sync plugins` that lists loaded plugin name, version, and registered extension ids, including trust wording in help or output
- [x] 4.3 Update CLI tests so `scan` still works with no `plugins:` key, unknown source types fail clearly, and `plugins` lists the built-in `fs` connector; verify with `pnpm test`

## 5. Example plugin and docs

- [x] 5.1 Add `examples/plugins/mask-company-id.mjs` registering a `pii-rule` id `mask-company-id`, plus a CLI/integration test that loads it from a temp config (including a Japanese plugin name scenario if covered via unit test) and shows it in `knot-sync plugins`; verify with `pnpm test`
- [x] 5.2 Update README.md (plugin model, `plugins` command, trust note) and mark `add-plugin-system` done in `docs/ROADMAP.md`; verify the documented `knot-sync plugins` flow against `examples/` or the test fixture
- [x] 5.3 Run full `pnpm test` and `pnpm scan:sample` and confirm exit 0 with inventory still saved

## Workflow follow-up

- Archive the change with `/opsx:archive add-plugin-system` after review.
- Commit on a feature branch and open a PR into `main` (branch protection requires PR).
