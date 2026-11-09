# @hoanghainh/knot-sync-guard

Built-in prompt-injection guard plugin.

## Rule ids

| Id | Detects |
|---|---|
| `instruction-en` / `instruction-ja` / `instruction-vn` | Instruction-override phrases |
| `controls` | Zero-width / bidi control characters |
| `controls-flood` | Dense control-character floods (elevates risk vs a single hit) |
| `base64-payload` | Long Base64-looking payloads (min length 64) |
| `md-exfil` | Markdown image/link `http(s)` destinations (pattern-only; no fetch) |
| `hidden-text` | Extractor-provided hidden channel (via metadata) |

Modes (`guard.mode`): `flag`, `strip`, `block`.

Part of [KnotSync](https://github.com/hoanghainh1188/knot-sync). See the
repository root README for install and usage.

**License:** Apache-2.0  
**Version:** 0.1.1
