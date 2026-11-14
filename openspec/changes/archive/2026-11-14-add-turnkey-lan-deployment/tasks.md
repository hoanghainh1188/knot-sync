# Tasks

## 1. Non-Root Dockerfile & LAN Docker Compose Stack

- [x] 1.1 Create root `.dockerignore` and multi-stage non-root `Dockerfile` (Node.js 22 Alpine, `USER node`, `/mcp` Node `fetch` `HEALTHCHECK`, `ENTRYPOINT` running `knot-sync`) and verify Dockerfile syntax/directives
- [x] 1.2 Create `deploy/docker-compose.lan.yml` and `deploy/.env.example` orchestrating `knot-sync` (`serve --http --host 0.0.0.0 --port 3940 --sync-interval 300`, `:ro` customer source and config mounts, `rw` `.data/` mount) plus optional `ocr` (`docling-serve-cpu`) and `local-ai` (`ollama`) profiles on an internal bridge network
- [x] 1.3 Add `node:test` verification in `packages/cli` validating `Dockerfile` (non-root `USER`, `HEALTHCHECK`, Node 22), `.dockerignore`, `deploy/docker-compose.lan.yml` (`:ro` mounts, healthcheck, `ocr`/`local-ai` profiles), `deploy/.env.example`, and running a container build / CLI invocation smoke test when Docker is available (`pnpm test`)

## 2. Trilingual 3-Step Enterprise Pilot Playbook

- [x] 2.1 Write `docs/PILOT_PLAYBOOK.md` (English), `docs/ja/PILOT_PLAYBOOK.md` (Japanese), and `docs/vi/PILOT_PLAYBOOK.md` (Vietnamese) covering Step 1 (`scan --pii --report`), Step 2 (`describe` + `ui`), and Step 3 (LAN `serve --http` + Claude Desktop / Cursor MCP client config) with read-only (`:ro`) guarantees
- [x] 2.2 Add `node:test` verification in `packages/cli` asserting all three playbook files exist and contain the 3-step commands, read-only markers (`:ro` / `読み取り専用` / `chỉ đọc`), and `/mcp` client setup, and verify tests pass (`pnpm test`)

## 3. Documentation & Full Verification

- [x] 3.1 Update `README.md`, `packages/cli/README.md`, and `docs/ROADMAP.md` to link to `docs/PILOT_PLAYBOOK.md` (EN/JA/VI) and `deploy/docker-compose.lan.yml`, mark `#57` / v0.5 as `✅ done`, and verify full workspace build and test suite pass (`pnpm test`)
