# Design

## Context

See proposal.md for motivation. Today CLI user text is inline English strings
in `packages/cli` (`HELP`, `io.out` / `io.err` in `main.ts` / `describe.ts`).
Config has no locale field; `CORE_TOP_LEVEL_KEYS` in core does not include
`cli`. Docs under `docs/ja` and `docs/vi` already exist (`docs-i18n`); this
change is runtime CLI messaging only.

Hard constraints that shape the design: fully local (no CDN/locale download),
no new native deps, keep each change small, machine interfaces stay stable.

## Goals / Non-Goals

**Goals:**
- Typed message catalogs for `en` / `ja` / `vi` used by all human CLI output.
- One resolution function for effective locale (flag → config → env → `en`).
- Config parse for optional `cli.locale` without treating `cli` as a plugin bag.
- Tests that lock Japanese/Vietnamese samples and English JSON keys.

**Non-Goals:**
- ICU / plural / gender frameworks or third-party i18n libraries.
- Localizing MCP tool schemas, HTML report chrome beyond current behavior,
  or catalog YAML business labels.
- Translating `ConfigError` / connector issue *payloads* that originate deep
  in core with dynamic English technical detail (CLI wraps with localized
  prefixes and next-step hints; raw technical fragments may remain English).

## Decisions

### 1. Message catalogs as TypeScript modules in `packages/cli`

**Choice:** `packages/cli/src/i18n/{types,en,ja,vi,index}.ts` with a shared
key union and `t(locale, key, params?)` interpolating `{name}` placeholders.
**Why:** No new dependency; stays in the published CLI package; typecheck
catches missing keys across locales.
**Alternatives:** JSON files (weaker typing), `i18next` (extra dep, unused
features), put catalogs in `core` (pulls UI strings into a library used by
MCP/store).

### 2. Locale resolution ownership in CLI, config only stores preference

**Choice:** Core parses/validates `cli.locale` onto `AppConfig` /
`StructuralConfig`. CLI `resolveLocale({ flag, configLocale, env })` applies
priority. Flag name: `--lang` (short enough; documented as `en|ja|vi`).
**Why:** Help/version work before config load; config is for persistent site
preference.
**Alternatives:** Only env (harder for operators), only config (cannot
localize missing-config errors), `Intl` locale negotiation (overkill).

### 3. Env heuristic

**Choice:** `KNOT_SYNC_LANG` if exactly `en|ja|vi`; else if `LANG` or
`LC_ALL` starts with `ja` → `ja`, `vi` → `vi`; ignore other values.
**Why:** Predictable for JP/VN laptops without surprising CJK-adjacent
locales into Japanese.
**Alternatives:** Full BCP-47 negotiation (complexity), no env (worse UX).

### 4. What gets translated

**Choice:** Help body, usage/unknown-command text, scan/run/describe/plugins
human summaries, error prefixes (`Config error`, `Catalog error`, generic
`Error`), and next-step sentences. Keep command/flag tokens, paths, ids, and
`--json` keys in English.
**Why:** Matches specs; avoids breaking scripts that scrape JSON or argv.

### 5. Core errors

**Choice:** Do not rewrite every `ConfigError` string in core in this change.
CLI prints `t(..., 'error.configPrefix') + err.message` (and catalog/generic
equivalents). High-traffic CLI-owned messages (missing inventory, unknown
command, init exists) move fully into catalogs.
**Why:** Keeps the change inside ~1–2 weeks; core remains English source of
truth for validation detail.
**Trade-off:** Mixed-language lines when locale is ja/vi and the core message
is English — acceptable for v0.2; a later change can add error codes.

### 6. Read-only and fully local

Catalogs ship inside the npm package. No network fetch of translations.
No writes to customer sources; only existing config/store paths are touched
as today. Locale never affects MCP document framing.

## Risks / Trade-offs

- **[Risk] Missing key in ja/vi** → Mitigation: shared key type + unit test
  that every locale defines every key; fallback to English string in `t()` if
  somehow missing at runtime.
- **[Risk] Tests hard-code English stderr** → Mitigation: update CLI tests;
  add explicit `--lang ja|vi` cases; default suite can keep `en` or set
  `KNOT_SYNC_LANG=en` in tests for stability.
- **[Risk] Spec reserved-keys list lagged `catalog`** → Mitigation: this
  change’s config delta lists `catalog` and `cli` to match the loader.
- **[Trade-off] Mixed-language core errors** → Documented; defer error codes.

## Migration Plan

- Existing configs without `cli:` keep English unless env/`--lang` set.
- No store schema migration.
- Starter YAML gains a commented `cli.locale` example on next `init`.
- Rollback: revert the change; behavior returns to English-only.

## Open Questions

None — deferred items are listed as non-goals / out of scope in the proposal.
