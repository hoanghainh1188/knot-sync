# Design

## Context

See proposal.md — Why. Built-in `extractor-office` uses `unpdf` for PDFs and
returns code `EMPTY` when there is no text layer, with a message that OCR is
out of scope. Images are inventory `type: image` but have no extractor.
`findExtractor` returns the **first** registered extractor claiming an
extension; builtins register before config `plugins:`, so office always owns
`.pdf` today. Paid roadmap: Docling via Docker, plugin license self-check,
local-only.

## Goals / Non-Goals

**Goals:**

- Opt-in OCR plugin using local Docker Docling
- PDF fallthrough: office EMPTY → OCR when plugin loaded
- Image extensions extractable when plugin loaded
- Soft-fail Docker/license/timeout; read-only sources; no cloud OCR
- Prefer **no new npm dependencies** (spawn `docker`)

**Non-Goals:**

- Default built-in OCR in free CLI
- Cloud OCR, 方眼紙, OAuth, vector search
- Shipping a commercial license server in core
- Running Docling inside the Node process (native/Python bindings)

## Decisions

### 1. Package layout

**Choice:** `packages/extractor-ocr` with npm name
`@hoanghainh/knot-sync-extractor-ocr`, `"private": true` for now, loaded only via
`plugins: [ "./node_modules/..."]` or workspace path / future paid registry.
Plugin `name` e.g. `extractor-ocr`; settings under top-level key `extractor-ocr:`.

**Alternatives:** Put OCR inside `extractor-office` — rejected; would force Docker
into free path and blur paid boundary.

### 2. Docker invocation

**Choice:** `child_process` spawn of `docker run --rm -v <absFile>:<roMount>:ro ...`
with a pinned Docling image tag documented in README. Mount **only the single
source file** (or a temp copy under KnotSync’s store/work dir—not rewriting the
source). Capture stdout/stderr markdown/text; map to `Document`.

**Read-only / local:** volume is `:ro`; working files under `.data/` or OS temp
owned by KnotSync; no outbound OCR HTTP. Image **pull** is setup (`docker pull`),
documented separately from `run`.

**Alternatives:** `dockerode` npm dep — unnecessary; REST sidecar daemon —
heavier ops for v1.

### 3. PDF fallthrough in CLI

**Choice:** Extend `run` (or a small helper used by `run`):

1. `extractor = findExtractor(host, file)`
2. `result = await extractor.extract(...)`
3. If `!result.ok && result.code === "EMPTY" && file.ext === ".pdf"`, look up OCR
   extractor by id (e.g. `ocr-docling`) or by “claims .pdf and id !== office”
4. If found, `ocrResult = await ocr.extract(...)` and use that

Update office EMPTY message to say OCR plugin can be enabled when available.

**Alternatives:** Reorder plugins so OCR overrides office for all PDFs —
rejected; would OCR text PDFs and force Docker always.

### 4. License self-check

**Choice:** Plugin reads `process.env.KNOT_SYNC_OCR_LICENSE` (override via
settings `licenseEnv`) or settings `licenseKey`. Invalid/missing →
`{ ok: false, code: "LICENSE", message: "..." }`. Dev/tests may use a documented
test sentinel. Core unchanged.

### 5. Pinning Docling

**Choice:** Document a specific image reference (e.g.
`ghcr.io/.../docling:…` or the upstream recommended image) and license (Docling
MIT as of design time—re-verify at apply). Tests **mock** `docker` (fake script
on `PATH`) so CI does not pull images.

### 6. i18n

Add minimal en/ja/vi strings for OCR Docker/license/timeout failures when CLI
surfaces them; English codes stay stable.

## Risks / Trade-offs

- **[Docker not installed]** → Soft-fail + docs; free path unchanged
- **[Large scans OOM the container]** → Enforce max size + timeout; document
  resource needs
- **[OCR quality variance]** → No marketing %; fixture golden tests only for
  mock path; optional manual Docling smoke doc
- **[Paid code in Apache monorepo]** → Private package + license gate; future
  move to commercial repo without API break
- **[Conflict with “no network at runtime”]** → OCR inference is local; image
  pull is setup-only (same class as `pnpm install`)

## Migration Plan

- No store schema change
- Existing installs unchanged until `plugins:` lists OCR
- Rollback: remove plugin entry

## Open Questions

Resolved at apply:

- **Image:** `quay.io/docling-project/docling-serve-cpu:v1.38.2` (also on ghcr.io).
- **CLI:** `docker run --rm -v <file>:/input/<base>:ro -v <tmpdir>:/output <image> docling /input/<base> --to md --output /output --image-export-mode placeholder --force-ocr`.
