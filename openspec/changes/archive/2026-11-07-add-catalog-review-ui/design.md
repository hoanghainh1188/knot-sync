# Design

## Context

See proposal.md for motivation. Today the catalog is produced by
`knot-sync describe` and edited as YAML. Packages: `packages/catalog`
(load/merge/write), `packages/cli` (commands), no HTTP server in-tree except
MCP stdio. Product constraints: read-only toward customer sources, fully
local (no telemetry/CDN), Node ≥ 22.13, Apache-2.0-compatible deps, ~1–2 week
change size.

## Goals / Non-Goals

**Goals:**
- Loopback HTTP server + React review UI bundled into the published CLI.
- CRUD-ish edit of catalog entries via local API → `writeCatalogFile`.
- Locale-aware UI chrome; Japanese/Vietnamese column scenarios in tests.

**Non-Goals:**
- General-purpose admin UI, auth, TLS, LAN bind.
- Calling customer DBs from the UI (review is offline against catalog YAML).
- Replacing `describe` or changing merge/preserve-reviewed algorithms.

## Decisions

### 1. Package `packages/ui` (`@hoanghainh/knot-sync-ui`)

**Choice:** Separate package holding React source, Vite build, and a small
Node helper that creates an `http.Server` (or uses `node:http`) serving
`dist/` static files + `/api/*`. CLI depends on it and implements
`knot-sync ui`.
**Why:** Keeps React/Vite out of core; clear `files` for publishing; matches
monorepo style.
**Alternatives:** All UI inside `packages/cli` (heavier CLI package.json);
iframe to external app (violates local/CDN rules).

### 2. Runtime stack

**Choice:** React 18+ + react-dom (MIT). Build with Vite (MIT) as
devDependency; commit/publish prebuilt assets under `packages/ui/dist`
(or build in CI/`pnpm build` before pack). Node `http` + manual router for
API—no Express (fewer deps).
**Why:** Fits license rules; zero runtime native deps; loopback-only is easy
with `server.listen(port, '127.0.0.1')`.

### 3. Local API surface

**Choice (minimal):**
- `GET /api/health` → `{ ok: true }`
- `GET /api/catalog` → catalog JSON (from `loadCatalogFile`)
- `PUT /api/catalog` → body = full `CatalogDocument`; validate lightly then
  `writeCatalogFile`
- Static files for `/` and assets

**Why:** Full-document PUT avoids inventing a patch protocol in v0.2; UI
holds the working copy.
**Alternatives:** JSON Patch per column (more code); WebSocket (unnecessary).

### 4. Port and flags

**Choice:** Default port `8787` (documented). Flags: `--port <n>`, reuse
`-c/--config`, `--lang`. Optional later config `ui.port` **deferred** to keep
config surface small unless needed—start with flags only; record in design
that config key can follow in a tiny follow-up if operators ask.
**Why:** Avoid expanding `config` reserved keys mid-v0.2 unless required by
spec—spec says port MAY be configurable (flag satisfies).

### 5. Read-only / local guarantees

- API never receives source filesystem write paths; only `config.catalog.path`.
- No outbound HTTP from server or UI (no analytics scripts).
- Reject starting if bind address were ever non-loopback (hard-code host).
- Catalog write is allowed: it is KnotSync’s own artifact, not a customer
  source (same as `describe` today).

### 6. Testing strategy

- Unit: API handlers with temp catalog YAML (JP table/column names).
- CLI: `ui --help` / missing config; optional short listen+fetch health test
  then close server.
- Build: assert index HTML has no `https://cdn` / unpkg / jsdelivr URLs.
- No Playwright required for this change if API+static contract is tested;
  optional smoke with `fetch` against loopback.

## Risks / Trade-offs

- **[Risk] Vite/React version churn** → Pin exact versions; list in proposal.
- **[Risk] Large published tarball** → Tree-shake; single JS bundle; no
  source maps in publish if size hurts.
- **[Risk] Concurrent describe + UI save** → Last-write-wins; document; no
  file lock in v0.2.
- **[Trade-off] Full-document PUT** → Simpler, but UI must not drop unknown
  fields—round-trip through catalog types only.

## Migration Plan

- Existing catalogs work unchanged.
- New command; no store migration.
- Rollback: remove `ui` command/package; YAML hand-edit remains.

## Open Questions

None blocking. Optional `ui.port` in YAML deferred unless apply discovers a
hard need.
