# Design

## Context

See [proposal.md](./proposal.md) for motivation.

Currently:
- KnotSync CLI (`packages/cli`) already supports `scan --pii --report`, `describe`, `ui`, and `serve --http --host <host> --port <port> --sync-interval <sec>` with mandatory `KNOT_SYNC_API_KEY` Bearer auth when `--http` is enabled.
- `packages/mcp-server/src/http.ts` exposes Streamable HTTP at `/mcp` and binds to `127.0.0.1` by default unless `--host 0.0.0.0` is passed.
- `docs/ja/` and `docs/vi/` already exist for localized overview documentation.

## Goals / Non-Goals

**Goals:**
- Provide a reproducible, non-root Node.js 22 `Dockerfile` and `.dockerignore` that runs `@hoanghainh/knot-sync` cleanly with an offline-safe `HEALTHCHECK`.
- Provide `deploy/docker-compose.lan.yml` and `deploy/.env.example` enforcing kernel-level `:ro` mounts on customer source directories and config files, `rw` `.data/` persistence, and optional `ocr` / `local-ai` profiles.
- Provide the 3-step Enterprise Pilot Playbook in EN, JA, and VI (`docs/PILOT_PLAYBOOK.md`, `docs/ja/PILOT_PLAYBOOK.md`, `docs/vi/PILOT_PLAYBOOK.md`).

**Non-Goals:**
- Runtime changes to `@hoanghainh/knot-sync` HTTP server, auth, or connectors.
- TLS termination / reverse-proxy config (documented as optional customer IT step in the playbook).

## Decisions

### 1. Multi-stage Non-Root `Dockerfile` (`node:22-alpine`)

- **Builder stage**: Uses `node:22-alpine`, enables `corepack`, copies workspace manifests and packages, runs `pnpm install --frozen-lockfile && pnpm bundle:cli` (or builds `packages/cli` and prunes devDependencies) so the runtime image has no build toolchain or devDependencies.
- **Runtime stage**: Uses `node:22-alpine`, creates `/app` and `/data` owned by the built-in unprivileged `node` user (UID 1000), switches to `USER node`, sets `WORKDIR /app`, exposes port `3940`, sets `ENTRYPOINT ["node", "/app/packages/cli/dist/bin.js"]` (or `knot-sync` symlink), and defaults `CMD ["serve", "--http", "--host", "0.0.0.0", "--port", "3940", "--sync-interval", "300", "-c", "/app/knot-sync.config.yaml"]`.
- **Rationale**: Running as non-root (`USER node`) satisfies corporate IT security audits; `node:22-alpine` keeps image size small and avoids needing `curl` or extra OS packages.

### 2. Zero-Dependency `HEALTHCHECK`

- Uses Node.js 22 built-in `fetch`:
  ```dockerfile
  HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.KNOT_SYNC_PORT || 3940) + '/mcp').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"
  ```
- **Rationale**: `/mcp` returns `401 Unauthorized` without a Bearer token when the server is healthy and listening, and `status < 500` verifies HTTP readiness without putting `KNOT_SYNC_API_KEY` into the image or process args.

### 3. Docker Compose LAN Stack & Read-Only Guarantees

- `deploy/docker-compose.lan.yml` defines:
  - `knot-sync` service: builds from `..` (`Dockerfile`), mounts:
    - `${KNOT_SYNC_SOURCES_DIR:-../examples/sample-data}:/sources:ro`
    - `${KNOT_SYNC_CONFIG:-../examples/sample.config.yaml}:/app/knot-sync.config.yaml:ro`
    - `${KNOT_SYNC_DATA_DIR:-./.data}:/data:rw`
  - Optional `docling-serve` (`profiles: ["ocr"]`, image `quay.io/docling-project/docling-serve-cpu:latest`) and `ollama` (`profiles: ["local-ai"]`, image `ollama/ollama:latest`) attached to `knot-internal` bridge network.
- **Read-only & fully-local guarantees**:
  - `:ro` Docker bind mounts enforce read-only access at the Linux VFS level so even a misconfigured process inside the container cannot modify, move, or delete customer files.
  - `docling-serve` and `ollama` are only reachable on the internal Compose network (`knot-internal`) with no host port exposure required by default, and no outbound internet access is needed after images/models are pulled.

### 4. Trilingual 3-Step Pilot Playbook

- `docs/PILOT_PLAYBOOK.md` (EN), `docs/ja/PILOT_PLAYBOOK.md` (JA), `docs/vi/PILOT_PLAYBOOK.md` (VI):
  - Step 1 (Day 1 Audit): `knot-sync scan --pii --report` -> HTML Data Readiness & PII Risk Report.
  - Step 2 (Day 2–3 Semantic Cataloging): `knot-sync describe` + `knot-sync ui` -> human review of cryptic columns (`TKSK_CD`, `ma_kh`).
  - Step 3 (Day 4–5 Team MCP Rollout): `docker compose -f deploy/docker-compose.lan.yml up -d` + Claude Desktop / Cursor MCP config pointing to `http://<lan-ip>:3940/mcp` with `Authorization: Bearer <KNOT_SYNC_API_KEY>`.

## Risks / Trade-offs

- **UID mismatch on bind-mounted `.data/` or `:ro` host folders** → Mitigation: Document `KNOT_SYNC_UID` / `chown 1000:1000 .data` in `deploy/.env.example` and `PILOT_PLAYBOOK.md` for Linux hosts with strict folder permissions.
- **Docker daemon unavailable in CI/sandbox environments** → Mitigation: `node:test` validates `Dockerfile` syntax/directives, `deploy/docker-compose.lan.yml` structure (`:ro` mounts, healthcheck, profiles), `.env.example`, and EN/JA/VI playbooks unconditionally, and runs `docker build` + container CLI smoke test when Docker daemon is available (or in CI).
