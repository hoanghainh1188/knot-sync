# @hoanghainh/knot-sync-extractor-housen

Opt-in **方眼紙 / form-like Excel** layout plugin for KnotSync. Detects sparse
JP ops sheets (labels beside values, merged titles) and emits structured
Markdown instead of a flat first-row-as-header dump. Not a free built-in —
list it under config `plugins:`.

## Setup

1. Set a license (self-checked by this plugin, never by KnotSync core):

```bash
export KNOT_SYNC_HOUSEN_LICENSE=your-license-key
```

For local tests only, the sentinel `knot-sync-housen-dev` is accepted.

2. Enable the plugin:

```yaml
plugins:
  - ../packages/extractor-housen/dist/index.js   # monorepo example

extractor-housen:
  # formThreshold: 0.42
  # timeoutSeconds: 30
  # licenseEnv: KNOT_SYNC_HOUSEN_LICENSE
  # licenseKey: knot-sync-housen-dev   # tests / local only
  # maxInputMb: 50
```

3. `knot-sync scan` then `knot-sync run`. Plain data tables stay on the built-in
   office extractor; form-like `.xlsx` files are rewritten when this plugin is
   loaded and licensed.

## Soft-fail codes

| Code | Meaning |
| --- | --- |
| `LICENSE` | Missing/invalid license |
| `NOT_FORM` | Below form threshold (CLI keeps office Document; not an operator error) |
| `SKIPPED_TOO_LARGE` | Input over size bound |
| `EXTRACT_TIMEOUT` | Layout timed out |
| `EMPTY` / `PARSE` | No cells / unreadable workbook |

Sources are never written. Local heuristics only — no network, no LLM.
