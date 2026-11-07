# Proposal

## Why

`describe` can draft a Semantic Catalog, but confirming labels still means
editing YAML by hand. JP/VN operators need a simple local screen to review
and mark columns as `reviewed: true` so MCP enrichment stays trustworthy.
Roadmap v0.2 calls for `knot-sync ui` with a catalog review screen next.

## What Changes

- Add `knot-sync ui` that serves a **bundled** web UI on **127.0.0.1** only
  (default port documented; configurable).
- Ship a **Semantic Catalog review** screen: browse sources/tables/columns,
  edit business labels (ja/vi/en), description, values, `pii` / `expose` /
  `reviewed`, and save back to `knot-sync.catalog.yaml`.
- Local JSON API used only by that UI; writes **only** the catalog file
  (KnotSync-owned), never customer source folders or databases.
- Reuse CLI locale resolution (`--lang` / `cli.locale`) for UI chrome where
  practical (en/ja/vi).
- New package for the UI (React) plus build so the published npm CLI includes
  static assets—no CDN at runtime.
- Tests, README, and ROADMAP updates.

**Out of scope (defer):**
- `knot-sync bench` (`add-bench`)
- Scan/run dashboards, document search UI, SQL allow-list editors
- Binding to non-loopback addresses, HTTP auth, HTTPS, OAuth (paid)
- Network/telemetry, remote hosts, embedding LLM for labels (paid)
- Changing MCP protocol or store schema

**New third-party dependencies (licenses):**
- `react` (MIT) — UI runtime
- `react-dom` (MIT) — UI runtime
- `vite` (MIT) — **dev/build** only (not a runtime CDN)
- `@vitejs/plugin-react` (MIT) — **dev/build** Vite React plugin
- `@types/react` / `@types/react-dom` (MIT) — **dev** TypeScript types

No GPL/AGPL. No native addons.

## Capabilities

### New Capabilities

- `catalog-review-ui`: Local loopback UI command, catalog review screen, and
  local API that loads/saves the Semantic Catalog YAML.

### Modified Capabilities

- `semantic-catalog`: Note that humans MAY confirm entries via the review UI
  (in addition to hand-editing YAML); reviewed semantics unchanged.

## Impact

- New package under `packages/` (UI + static build output consumed by CLI).
- `packages/cli`: `ui` command, help text, locale wiring, serve static + API.
- `packages/catalog`: reuse `loadCatalogFile` / `writeCatalogFile` (no rewrite
  of merge/`describe` rules).
- Docs: README, `docs/ja`, `docs/vi`, `docs/ROADMAP.md`.
- CI: build UI assets as part of `pnpm test` / package build so published
  tarball includes them.
