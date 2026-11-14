# KnotSync Enterprise Pilot Playbook (3-Step Rollout)

> **Languages:** English · [日本語](ja/PILOT_PLAYBOOK.md) · [Tiếng Việt](vi/PILOT_PLAYBOOK.md)

This playbook gives IT administrators and SIers a standardized **5-day pilot** for deploying KnotSync as a **shared LAN appliance** (Model B) without modifying customer files or sending data to external clouds.

## Security & Read-Only Guarantees

- **OS-level read-only (`:ro`)**: Customer document folders and `knot-sync.config.yaml` are mounted with `:ro` in [deploy/docker-compose.lan.yml](../deploy/docker-compose.lan.yml). KnotSync never writes, moves, or deletes customer source files.
- **Non-root container**: The official [Dockerfile](../Dockerfile) runs as the unprivileged `node` user.
- **100% local / offline**: After pulling container images, all scanning, PII masking, SQLite FTS indexing, and optional OCR (`docling-serve-cpu`) or LLM (`ollama`) run strictly inside your LAN.

---

## Step 1 — Day 1: Data Audit & PII Risk Report

Run an initial read-only scan to measure file coverage, broken/empty files, and potential PII before exposing anything to AI agents:

```bash
npx @hoanghainh/knot-sync scan --config knot-sync.config.yaml --pii --report
```

- Produces a self-contained offline HTML report (`./knot-sync-scan-report.html`) with file counts, unreadable/corrupted warnings, and PII risk estimates.
- Review the report with business & security stakeholders to sign off on `pii.rules`, `pii.allowlist`, and `source.allow` before proceeding.

---

## Step 2 — Day 2–3: Semantic Cataloging (ERP / Legacy Tables)

If your pilot includes SQL/ERP databases with cryptic physical column names (for example `TKSK_CD` or `ma_kh`), generate a draft Semantic Catalog and review it with domain leads:

```bash
npx @hoanghainh/knot-sync describe --config knot-sync.config.yaml
npx @hoanghainh/knot-sync ui --config knot-sync.config.yaml
```

- Open the local loopback UI (`http://127.0.0.1:3939`) to confirm Japanese, Vietnamese, and English business labels, enum values, foreign-key `references`, and pre-approved `lookupJoins` (`reviewed: true`).
- Entries marked `reviewed: true` in `knot-sync.catalog.yaml` are preserved across future `describe` runs.

---

## Step 3 — Day 4–5: Turnkey LAN MCP Server Rollout

1. **Configure environment (`deploy/.env`)**:
   ```bash
   cp deploy/.env.example deploy/.env
   # Set KNOT_SYNC_API_KEY (e.g. openssl rand -hex 32)
   # Set KNOT_SYNC_SOURCES_DIR and KNOT_SYNC_CONFIG
   mkdir -p deploy/.data && chown 1000:1000 deploy/.data
   ```

2. **Start the LAN appliance**:
   ```bash
   # Core LAN MCP server (runs `serve --http --host 0.0.0.0 --port 3940 --sync-interval 300` with :ro mounts)
   docker compose -f deploy/docker-compose.lan.yml up -d

   # Optional: include offline Docling OCR and/or local Ollama
   docker compose -f deploy/docker-compose.lan.yml --profile ocr --profile local-ai up -d
   ```

3. **Verify health**:
   ```bash
   docker compose -f deploy/docker-compose.lan.yml ps
   ```

4. **Connect Claude Desktop / Cursor workstations**:
   Point team MCP clients to `http://<lan-server-ip>:3940/mcp` with the shared Bearer token:
   ```json
   {
     "mcpServers": {
       "knot-sync-lan": {
         "url": "http://192.168.1.50:3940/mcp",
         "headers": {
           "Authorization": "Bearer <KNOT_SYNC_API_KEY>"
         }
       }
     }
   }
   ```
