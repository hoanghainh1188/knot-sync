# Tasks

## 1. OCR plugin package skeleton

- [x] 1.1 Create `packages/extractor-ocr` (private workspace package, plugin
      default export, `apiVersion` compatible) registering extractor id
      `ocr-docling` with image extensions — verify `knot-sync plugins` lists it
      only when listed under `plugins:`
- [x] 1.2 Parse plugin settings (`image`, `timeoutSeconds`, `licenseEnv` / license
      fields); reject unknown keys and non-positive timeouts — verify unit tests
- [x] 1.3 License self-check: missing/invalid → `LICENSE` soft-fail; valid test
      sentinel allows extract path — verify with JP filename `経理/請求書.png` in
      the error/success messaging paths

## 2. Docker Docling adapter

- [x] 2.1 Implement local `docker run` invocation (read-only mount, timeout,
      capture text/markdown); no cloud HTTP OCR client — verify with a mock
      `docker` on `PATH` returning fixed Markdown containing `請求書`
- [x] 2.2 Map Docker failures (daemon down, image missing, non-zero exit) to
      actionable extractor codes/messages — verify unit tests; no source writes
- [x] 2.3 Honor max input size / extraction timeout interaction; oversized or
      timed-out OCR soft-fails — verify tests

## 3. CLI fallthrough and docs

- [x] 3.1 Wire `run` PDF `EMPTY` → OCR extractor when plugin loaded; text PDFs
      skip OCR — verify with mocked office EMPTY + mock OCR success, and a
      text-PDF path that never calls docker
- [x] 3.2 Add en/ja/vi CLI strings for OCR Docker/license guidance as needed —
      verify `--lang ja` / `--lang vi` on a forced LICENSE or DOCKER failure
- [x] 3.3 Update root README / Paid section in `docs/ROADMAP.md` (OCR in
      progress or done); document `docker pull`, `plugins:`, license env; run
      full `pnpm test` (mock-only OCR; no Docling pull in CI)

## Workflow follow-up

- Archive with `/opsx:archive add-ocr-docling` after apply review
- Commit / PR when Harry asks
