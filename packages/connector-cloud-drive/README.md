# @hoanghainh/knot-sync-connector-cloud-drive

Opt-in **Paid** plugin providing read-only cloud drive connectors (`gdrive`, `sharepoint`, `onedrive`) for KnotSync.

- **Zero third-party runtime dependencies:** Uses Node.js >= 22.13 built-in `fetch` and `node:crypto`.
- **Strictly read-only:** Uses read-only scopes (`drive.readonly`, `Files.Read.All`, `Sites.Read.All`) and fetches file bytes in memory via `Connector.readBytes` without writing unmasked customer files to disk.
- **License:** Requires an offline Ed25519 `KS1` license token in `KNOT_SYNC_CLOUD_DRIVE_LICENSE` (or `connector-cloud-drive.license_env`).

## Example Config

```yaml
plugins:
  - "@hoanghainh/knot-sync-connector-cloud-drive"

sources:
  - id: gdrive_docs
    type: gdrive
    folder_id: "root"
    service_account_env: GOOGLE_SERVICE_ACCOUNT_JSON

  - id: sharepoint_docs
    type: sharepoint
    tenant_id_env: AZURE_TENANT_ID
    client_id_env: AZURE_CLIENT_ID
    client_secret_env: AZURE_CLIENT_SECRET
    site_id: "your-site-id"
```
