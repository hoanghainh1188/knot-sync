# Tasks

## 1. Config: optional `cli.locale`

- [x] 1.1 Add `CliConfig` / `cli` to core types and `CORE_TOP_LEVEL_KEYS`; parse and validate `cli.locale` (`en`|`ja`|`vi`) with actionable errors for unknown keys/values — verify with new `node:test` cases in core config tests
- [x] 1.2 Add a commented `cli.locale` example to `starterConfigYaml` — verify `knot-sync init` output (or unit test of starter YAML) contains the commented locale hint

## 2. CLI i18n module

- [x] 2.1 Add `packages/cli/src/i18n/` with shared message keys, `en`/`ja`/`vi` catalogs, `t()`, and `resolveLocale({ flag, configLocale, env })` — verify unit tests cover priority (flag > config > `KNOT_SYNC_LANG` > `LANG` heuristic > `en`) and invalid flag handling
- [x] 2.2 Assert every locale defines every key (parity test) — verify the parity test fails if a key is missing in `ja` or `vi`

## 3. Wire localized CLI output

- [x] 3.1 Parse `--lang`, resolve locale early in `main`, localize HELP / usage / unknown-command / init / scan / run / plugins / serve / describe human messages; keep `--json` keys and `--version` unchanged — verify CLI tests for `--lang ja` help, `--lang vi` unknown command, Japanese missing-inventory on `run`, and `scan --json --lang ja` English keys
- [x] 3.2 Stabilize existing CLI tests under default English (explicit `--lang en` or env) so CI locale does not flake — verify `pnpm test` passes for the cli package

## 4. Docs and full verification

- [x] 4.1 Document `--lang` and `cli.locale` in root `README.md` (and brief note in `docs/ja` / `docs/vi` if they list CLI options) — verify the documented flag appears in the README
- [x] 4.2 Mark CLI i18n progress under v0.2 in `docs/ROADMAP.md` — verify the roadmap mentions this slice
- [x] 4.3 Run full `pnpm test` at repo root — verify all packages pass

## Workflow follow-up

- Archive the change after review (`/opsx:archive add-cli-i18n`).
- Then propose `add-catalog-review-ui`, then `add-bench`.
