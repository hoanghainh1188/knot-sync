# Proposal

## Why

KnotSync’s product promise includes **scanned papers**, but open-core
`extractor-office` only extracts text-layer PDFs and skips true scans with an
actionable “needs OCR” message. Paid roadmap item **OCR (Docling via Docker)**
closes that gap for JP/VN operators who still live on paper PDFs and image
scans—without cloud OCR APIs.

## What Changes

- Add a new **opt-in extractor plugin** package (workspace) that runs **Docling
  in a local Docker sidecar** to OCR scanned PDFs and common image types into
  the Document model (Markdown text; tables when Docling provides them)
- Wire **PDF fallthrough**: when the built-in office extractor reports empty /
  non-text PDF and the OCR plugin is loaded, `run` retries via OCR instead of
  only recording EMPTY
- Register image extensions (e.g. `.png`, `.jpg`, `.jpeg`, `.tif`, `.tiff`,
  `.webp`) so inventory files of type `image` become extractable when OCR is
  enabled
- Plugin **self-checks** a license key (env or plugin settings); core never
  validates licenses
- Soft-fail with actionable codes when Docker/Docling is missing, the license
  is invalid, or OCR times out / OOMs—never write to the source tree
- Document setup (image pull as **install/setup**, not runtime telemetry),
  config, and mark the Paid OCR row in `docs/ROADMAP.md` as in progress / done
  when archived

**Assumptions (roadmap had no detailed prompt):**

- First OCR change lives in **this monorepo** as a private/opt-in package
  (`plugins:` entry), not a built-in loaded by default; commercial packaging /
  separate paid registry can follow without changing the plugin API
- Runtime OCR is **local Docker only** (no cloud Docling/HTTP OCR). Pulling the
  Docling image is a one-time/setup step operators run deliberately
- Text-based PDFs keep the existing office/unpdf path (no Docker required)

## Capabilities

### New Capabilities

- `ocr-docling`: local Docling-via-Docker OCR extraction for scanned PDFs and
  images, license gate, failure codes, and read-only/local guarantees

### Modified Capabilities

- `document-extraction`: PDF empty/scanned fallthrough to OCR when the plugin is
  loaded; image files may become extractable
- `plugin-system`: document paid OCR as an opt-in plugin (not a default built-in)
  and license-self-check expectation
- `config` (light): optional plugin settings key for the OCR plugin (image name,
  timeout, license env name)—unknown keys still fail under that plugin’s
  validator

## Impact

- Code: new `packages/extractor-ocr` (name TBD to match npm convention), CLI
  `run` / `findExtractor` fallthrough, tests with mocked Docker (no Docling in
  CI by default)
- Ops: Docker required only when the plugin is listed and OCR runs
- Product: still read-only to sources; no telemetry; MCP framing unchanged
- Dependencies: **no new npm native deps** preferred—spawn `docker` CLI. Docling
  container image is external (Docling project license MIT; confirm pin in
  design). Optional tiny deps only if proposal lists MIT/BSD/Apache/ISC

## Out of scope

- Cloud OCR APIs, hosted Docling, or any mandatory network call during `run`
- 方眼紙 Excel layout (separate paid item)
- Old binary `.xls` / `.doc`
- Making OCR a default built-in of the free CLI
- Core license-key enforcement
- Vector search / model-based guardrails / OAuth
- Guaranteeing OCR accuracy percentages in marketing (use fixtures + bench later)
- Writing OCR output back into the customer source folder
