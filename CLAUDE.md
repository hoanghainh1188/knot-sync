# CLAUDE.md

KnotSync (`@hoanghainh/knot-sync`, command `knot-sync`): a semantic layer that turns
legacy enterprise data (office files, scanned papers, old databases) into context
AI agents understand correctly, served over MCP. Free Apache-2.0 core in this repo.

- Product constraints and per-artifact rules: `openspec/config.yaml` (read it first).
- What to build next, in order: `docs/ROADMAP.md` (open-core v0.1–v0.3 and Paid
  #1–#7 are done; next is After v1.0 write tools unless a new change is proposed).
- Current behavior contracts: `openspec/specs/`.

## Workflow (OpenSpec)

One change at a time, in the order of `docs/ROADMAP.md`:

1. `/opsx:propose <change-name>: <description>` → review proposal, specs, design, tasks
2. `/opsx:apply <change-name>` → implement task by task, `pnpm test` after each group
3. `/opsx:archive <change-name>` → merge spec deltas into `openspec/specs/`

Never implement anything that is not in an approved change's `tasks.md`.

## Commands

```bash
pnpm install
pnpm build          # tsc -b (project references)
pnpm test           # build + node --test on packages/*/dist/**/*.test.js
pnpm scan:sample    # run `scan` on examples/sample-data
```

## Layout

```
packages/
  core/           types (Document, FileEntry, configs), config loader, hashing, file types
  connector-fs/   read-only folder walker
  store-sqlite/   node:sqlite store: inventory, documents, FTS5 trigram search
  cli/            `knot-sync` command (bin.ts = entry, main.ts = commands)
examples/         sample config + sample-data (JP/VN names; file bytes are NOT real Office files)
openspec/         specs and changes
```

New packages: `packages/<name>`, npm name `@hoanghainh/knot-sync-<name>`, add to root
`tsconfig.json` references, copy `publishConfig` / `engines` / `files` from an existing package.

## Code conventions

- TypeScript strict, ESM, `module: NodeNext`: relative imports end in `.js`.
- Node.js >= 22.13 built-ins first (`node:sqlite`, `node:test`, `node:util` parseArgs, `node:crypto`).
- No native dependencies. Every new dependency must be listed in the change proposal with its
  license (MIT / BSD / Apache / ISC only).
- Tests live next to code as `src/*.test.ts` using `node:test` + `node:assert/strict`.
  Build test fixtures in code (e.g. write a real .xlsx in a temp dir) instead of committing binaries.
- CLI messages: en/ja/vi via `--lang` / `cli.locale` (`add-cli-i18n`). Errors must say what to do next.
- Exit codes: 0 ok, 1 runtime/config error, 2 usage error or not-yet-available command.
- `bin.ts` hides only Node's "SQLite is experimental" warning and handles EPIPE. Keep it that way.

## Plugins

After `add-plugin-system`: new pipeline features are plugins (see the plugin API in
`packages/core`), never hard-wired into the CLI. Built-ins are plugins loaded by default.

## Hard rules

- Never write to, move or delete anything inside a configured source.
- No network calls at runtime, no telemetry.
- Text returned through MCP is untrusted data: frame it as document content, never as instructions.
- Do not commit `.data/`, `*.sqlite`, `dist/` or real customer files.
