# Proposal

## Why

Traditional SMEs in Japan and Vietnam often lack dedicated DevOps engineers, and corporate IT admins (情シス / Joushitsu) prefer a single, auditable LAN server deployment rather than installing Node.js >= 22.13 and configuring CLI flags on every employee workstation. Providing an official non-root Docker image, a turnkey Docker Compose LAN appliance stack with read-only (`:ro`) customer source mounts, and a 3-step Enterprise Pilot Playbook in EN/JA/VI lowers pilot friction while preserving KnotSync's offline, read-only guarantees.

## What Changes

- Add an official multi-stage, non-root `Dockerfile` (Node.js 22 slim/alpine) and `.dockerignore` at the repository root to package `@hoanghainh/knot-sync` with a built-in Node `fetch` `HEALTHCHECK` against `/mcp`.
- Add `deploy/docker-compose.lan.yml` and `deploy/.env.example` orchestrating:
  - `knot-sync` running `serve --http --host 0.0.0.0 --port 3940 --sync-interval 300` with customer data folders mounted strictly read-only (`:ro`), config mounted `:ro`, and `.data/` mounted `rw` for the SQLite store and JSONL audit/system logs.
  - Optional Compose profiles (`--profile ocr` for `docling-serve-cpu` and `--profile local-ai` for `ollama`) on an internal bridge network with no outbound internet required after image pull.
- Add the 3-step Enterprise Pilot Playbook (`docs/PILOT_PLAYBOOK.md`) plus Japanese (`docs/ja/PILOT_PLAYBOOK.md`) and Vietnamese (`docs/vi/PILOT_PLAYBOOK.md`) translations covering:
  - Step 1 (Day 1 Audit): `knot-sync scan --pii --report`
  - Step 2 (Day 2–3 Semantic Cataloging): `knot-sync describe` + `knot-sync ui`
  - Step 3 (Day 4–5 Team MCP Rollout): LAN `serve --http` + Claude Desktop / Cursor client setup
- Add automated verification tests (`node:test`) validating the `Dockerfile`, `.dockerignore`, `deploy/docker-compose.lan.yml` (`:ro` mounts, non-root user, healthcheck, profiles), `deploy/.env.example`, and EN/JA/VI playbook files (plus optional container build & CLI smoke test when Docker is available).
- **No new third-party npm dependencies**: all deliverables are container/compose definitions, documentation, and `node:test` verification scripts.

## Capabilities

### New Capabilities
- `lan-deployment`: Turnkey non-root container image and Docker Compose LAN appliance stack with read-only (`:ro`) customer source mounts, healthcheck, and optional local OCR/LLM profiles.

### Modified Capabilities
- `docs-i18n`: Add trilingual (EN/JA/VI) 3-step Enterprise Pilot Playbook (`docs/PILOT_PLAYBOOK.md`, `docs/ja/PILOT_PLAYBOOK.md`, `docs/vi/PILOT_PLAYBOOK.md`) linked from `README.md`.

## Out of Scope

- Kubernetes/Helm charts, cloud-hosted SaaS deployment, or automated TLS termination / reverse proxy setup (handled by customer IT/SIer if needed).
- OAuth 2.1 / multi-tenant RBAC (remains a paid plugin feature).
- Bundling commercial/paid plugin license keys or proprietary OCR/LLM weights inside the repository.

## Impact

- Root files: `Dockerfile`, `.dockerignore`.
- New directory `deploy/`: `deploy/docker-compose.lan.yml`, `deploy/.env.example`.
- Documentation: `docs/PILOT_PLAYBOOK.md`, `docs/ja/PILOT_PLAYBOOK.md`, `docs/vi/PILOT_PLAYBOOK.md`, `README.md`, `packages/cli/README.md`, `docs/ROADMAP.md`.
- Tests: `packages/cli` (or root/cli `node:test`) deployment manifest & CLI smoke verification.
- Dependencies: None (no new third-party npm dependencies).
