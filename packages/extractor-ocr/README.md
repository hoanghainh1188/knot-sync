# @hoanghainh/knot-sync-extractor-ocr

Opt-in OCR plugin for KnotSync. Uses a **local Docker** Docling image to turn
scanned PDFs and images into Markdown documents. Not loaded as a built-in —
list it under config `plugins:`.

## Setup

1. Install and start Docker.
2. Pull the pinned image (setup only; not part of a successful `run` path):

```bash
docker pull quay.io/docling-project/docling-serve-cpu:v1.38.2
```

3. Set a license (self-checked by this plugin, never by KnotSync core):

```bash
export KNOT_SYNC_OCR_LICENSE=your-license-key
```

For local tests only, the sentinel `knot-sync-ocr-dev` is accepted.

4. Enable the plugin in config (workspace path or installed package path):

```yaml
plugins:
  - ../packages/extractor-ocr/dist/index.js   # monorepo example

extractor-ocr:
  # image: quay.io/docling-project/docling-serve-cpu:v1.38.2
  # timeoutSeconds: 120
  # licenseEnv: KNOT_SYNC_OCR_LICENSE
  # licenseKey: knot-sync-ocr-dev   # tests / local only
  # maxInputMb: 50
```

5. Run `knot-sync scan` then `knot-sync run`. Image files (`.png`, `.jpg`, …)
   extract via OCR when the plugin is loaded. Scanned PDFs that office marks
   `EMPTY` fall through to this extractor.

## Settings

| Key | Default | Notes |
| --- | --- | --- |
| `image` | `quay.io/docling-project/docling-serve-cpu:v1.38.2` | Docker image reference |
| `timeoutSeconds` | `120` | Per-file OCR timeout (positive number) |
| `licenseEnv` | `KNOT_SYNC_OCR_LICENSE` | Env var name for the license |
| `licenseKey` | _(unset)_ | Inline key (prefer env in production) |
| `maxInputMb` | _(unset)_ | Soft-fail oversized inputs; else uses `extraction.maxFileSizeMb` |

Unknown keys fail plugin load with an actionable message.

## Soft-fail codes

| Code | Meaning |
| --- | --- |
| `LICENSE` | Missing/invalid license — set env or `licenseKey` |
| `DOCKER` | Docker missing, daemon down, or image not pulled |
| `SKIPPED_TOO_LARGE` | Input over size bound |
| `EXTRACT_TIMEOUT` | Docling did not finish in time |
| `EMPTY` | OCR produced no text |
| `PARSE` | Docling exited non-zero / unreadable output |

Sources are mounted **read-only**. No cloud OCR HTTP client.
