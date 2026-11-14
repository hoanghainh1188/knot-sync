# lan-deployment Specification

## Purpose

Provides an official non-root container image and Docker Compose LAN appliance stack so IT administrators can deploy KnotSync on-premises with read-only customer source mounts and optional local OCR/LLM services.

## Requirements

### Requirement: Non-root Node.js 22 container image with healthcheck
The repository SHALL include a root `Dockerfile` (and `.dockerignore`) based on Node.js 22 that builds `@hoanghainh/knot-sync`, runs as an unprivileged non-root user, and defines a `HEALTHCHECK` probing the local `/mcp` HTTP endpoint without external network calls.

#### Scenario: Container runs as non-root and exposes knot-sync CLI
- **WHEN** the container image is built from `Dockerfile`
- **THEN** the runtime `USER` is non-root and invoking `knot-sync --help` inside the container exits cleanly

#### Scenario: Healthcheck probes local MCP endpoint
- **WHEN** the container runs `serve --http`
- **THEN** the `HEALTHCHECK` probes `http://127.0.0.1:${PORT}/mcp` using Node.js built-in `fetch` without requiring `curl` or outbound internet access

### Requirement: Turnkey Docker Compose LAN stack with read-only source mounts
`deploy/docker-compose.lan.yml` (paired with `deploy/.env.example`) SHALL run `knot-sync serve --http --host 0.0.0.0 --port 3940 --sync-interval 300`, mount customer source directories strictly read-only (`:ro`), mount configuration files read-only (`:ro`), and mount `.data/` read-write for the SQLite store and logs.

#### Scenario: Customer folder mounted read-only in LAN Compose stack
- **WHEN** an IT admin configures `KNOT_SYNC_SOURCES_DIR` (for example `/srv/share/請求書`) and `KNOT_SYNC_API_KEY` in `.env` and starts `deploy/docker-compose.lan.yml`
- **THEN** the customer source directory and `knot-sync.config.yaml` are mounted with `:ro` while `.data/` is mounted `rw`

### Requirement: Optional offline OCR and local AI Compose profiles
`deploy/docker-compose.lan.yml` SHALL provide optional Compose profiles `ocr` (`docling-serve-cpu`) and `local-ai` (`ollama`) connected on an internal Docker bridge network so paid OCR and local LLM plugins operate on-premises without outbound internet calls after image pull.

#### Scenario: Base stack starts without OCR or local AI profiles
- **WHEN** an operator runs `docker compose -f deploy/docker-compose.lan.yml up -d` without `--profile` flags
- **THEN** only the `knot-sync` service starts on the internal bridge network

#### Scenario: Optional OCR and local-ai profiles join the internal network
- **WHEN** an operator passes `--profile ocr --profile local-ai`
- **THEN** `docling-serve` and `ollama` start on the same internal network alongside `knot-sync`
