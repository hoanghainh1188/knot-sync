# Proposal

## Why

KnotSync targets traditional companies in Japan and Vietnam, but every CLI
message (help, errors, scan/run summaries, next-step hints) is English-only.
Operators who are not fluent in English cannot follow guidance or fix config
problems without translating in their heads. v0.2 calls for CLI messages in
ja/vi; this change delivers that before the Web UI and bench work.

## What Changes

- Add a small **CLI locale** system (English, Japanese, Vietnamese) with no
  new third-party i18n library.
- Resolve locale from (highest wins): `--lang <en|ja|vi>`, then optional
  config `cli.locale`, then a conservative env/`LANG` heuristic, else `en`.
- Localize **user-facing** CLI text: help, usage errors, progress labels,
  human-readable scan/run/describe/plugins/serve messages, and error
  prefixes that tell the user what to do next.
- Keep **machine interfaces** stable in English: command names, flag names,
  `--json` field names/structure, exit codes, version string, file paths,
  source ids, and plugin ids.
- Extend config with optional `cli.locale` (`en` | `ja` | `vi`).
- Update tests, README, and ROADMAP.

**Out of scope (defer):**
- Web UI / catalog review screen i18n (`add-catalog-review-ui`)
- `knot-sync bench` (`add-bench`)
- MCP tool/resource/prompt description localization
- HTML scan report UI chrome beyond what already exists
- Translating customer document content or catalog YAML labels
- Paid features, network/CDN for locale packs

**New dependencies:** none (MIT/BSD/Apache/ISC N/A).

## Capabilities

### New Capabilities

- `cli-i18n`: Locale resolution and localized user-facing CLI messages for
  `en`, `ja`, and `vi`.

### Modified Capabilities

- `config`: Optional `cli.locale` setting and starter-config mention of it.

## Impact

- Packages: `packages/cli` (message catalogs, `main` / `describe` / related
  output), `packages/core` (optional `cli` config parse/types/starter YAML).
- Tests: CLI tests assert locale selection and sample ja/vi strings; config
  loader tests for `cli.locale`.
- Docs: README + `docs/ROADMAP.md` v0.2 status for this slice.
- No change to MCP protocol payloads, store schema, or source read-only
  guarantees.
