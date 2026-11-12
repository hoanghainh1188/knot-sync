import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createPluginHost, type ScanIssue } from "@hoanghainh/knot-sync-core";
import { signLicensePayload } from "@hoanghainh/knot-sync-plugin-license";
import {
  CLOUD_DRIVE_PLUGIN_NAME,
  CLOUD_DRIVE_TEST_LICENSE_SENTINEL,
  createCloudDrivePlugin,
} from "./index.js";

test("Ed25519 license gating: missing/invalid fails cleanly, valid & sentinel pass", async () => {
  const hostNoLic = createPluginHost();
  hostNoLic.registerPlugin(
    createCloudDrivePlugin({
      env: {},
      licenseOptions: { allowTestSentinel: false },
    }),
  );
  assert.ok(hostNoLic.connectors.has("gdrive"));
  assert.ok(hostNoLic.connectors.has("sharepoint"));
  assert.ok(hostNoLic.connectors.has("onedrive"));

  const gdrive = hostNoLic.connectors.get("gdrive")!;
  const cfg = gdrive.parseSource(
    { id: "gd1", type: "gdrive", client_id_env: "CID", client_secret_env: "CS", refresh_token_env: "RT" },
    { baseDir: ".", index: 0 },
  );

  await assert.rejects(
    async () => {
      for await (const _ of gdrive.scan(cfg)) {
        // unreachable
      }
    },
    /KNOT_SYNC_CLOUD_DRIVE_LICENSE|license/i,
  );

  // Valid Ed25519 token
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const token = signLicensePayload(
    {
      licensee: "Acme Corp JP",
      plugins: [CLOUD_DRIVE_PLUGIN_NAME],
      iat: Math.floor(Date.now() / 1000) - 10,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    privateKey,
  );
  const hostValid = createPluginHost();
  let fetchCalled = false;
  hostValid.registerPlugin(
    createCloudDrivePlugin({
      env: {
        KNOT_SYNC_CLOUD_DRIVE_LICENSE: token,
        CID: "c1",
        CS: "s1",
        RT: "r1",
      },
      licenseOptions: { publicKey, allowTestSentinel: false },
      fetchFn: async () => {
        fetchCalled = true;
        return new Response(JSON.stringify({ access_token: "tok", files: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }),
  );
  const gdriveValid = hostValid.connectors.get("gdrive")!;
  const cfgValid = gdriveValid.parseSource(
    { id: "gd1", type: "gdrive", client_id_env: "CID", client_secret_env: "CS", refresh_token_env: "RT" },
    { baseDir: ".", index: 0 },
  );
  const entries = [];
  for await (const e of gdriveValid.scan(cfgValid)) entries.push(e);
  assert.equal(entries.length, 0);
  assert.equal(fetchCalled, true);
});

test("Google Drive connector: Service Account JWT, JP/VN files, Workspace export, and size cap", async () => {
  const rsa = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const requests: Array<{ method: string; url: string }> = [];
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    requests.push({ method: req.method ?? "GET", url });

    if (req.method === "POST" && url === "/oauth/token") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        assert.match(body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ access_token: "gd-access-1", expires_in: 3600 }));
      });
      return;
    }

    if (url.startsWith("/drive/v3/files?")) {
      if (url.includes("folder-root")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            files: [
              { id: "sub-keiri", name: "経理", mimeType: "application/vnd.google-apps.folder" },
              {
                id: "doc-vn",
                name: "Hợp đồng bảo trì",
                mimeType: "application/vnd.google-apps.document",
                modifiedTime: "2026-01-10T00:00:00Z",
              },
            ],
          }),
        );
        return;
      }
      if (url.includes("sub-keiri")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            files: [
              {
                id: "xlsx-1",
                name: "請求書.xlsx",
                mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                size: "128",
                md5Checksum: "md5-xlsx-1",
                modifiedTime: "2026-01-11T00:00:00Z",
              },
            ],
          }),
        );
        return;
      }
    }

    if (url.startsWith("/drive/v3/files/doc-vn/export")) {
      res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      res.end(Buffer.from("EXPORTED-DOCX-BYTES"));
      return;
    }

    if (url.startsWith("/drive/v3/files/xlsx-1?alt=media")) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(Buffer.from("RAW-XLSX-BYTES"));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const host = createPluginHost();
    host.registerPlugin(
      createCloudDrivePlugin({
        env: {
          KNOT_SYNC_CLOUD_DRIVE_LICENSE: CLOUD_DRIVE_TEST_LICENSE_SENTINEL,
          GD_SA: JSON.stringify({
            client_email: "sync@example.iam.gserviceaccount.com",
            private_key: rsa.privateKey,
          }),
        },
      }),
    );
    const gdrive = host.connectors.get("gdrive")!;
    assert.throws(
      () => gdrive.parseSource({ id: "bad", type: "gdrive", private_key: "inline" }, { baseDir: ".", index: 0 }),
      /inline secrets/i,
    );

    const cfg = gdrive.parseSource(
      {
        id: "gd-main",
        type: "gdrive",
        folder_id: "folder-root",
        service_account_env: "GD_SA",
        api_base_url: baseUrl,
        token_url: `${baseUrl}/oauth/token`,
      },
      { baseDir: ".", index: 0 },
    );

    const entries = [];
    for await (const e of gdrive.scan(cfg)) entries.push(e);

    assert.equal(entries.length, 2);
    const vnDoc = entries.find((e) => e.relPath === "Hợp đồng bảo trì.docx")!;
    assert.ok(vnDoc);
    assert.equal(vnDoc.type, "docx");
    assert.ok(vnDoc.absPath.includes("export="));

    const jpXlsx = entries.find((e) => e.relPath === "経理/請求書.xlsx")!;
    assert.ok(jpXlsx);
    assert.equal(jpXlsx.hash, "md5-xlsx-1");

    const docBytes = await gdrive.readBytes!(vnDoc);
    assert.equal(docBytes.toString("utf8"), "EXPORTED-DOCX-BYTES");

    const xlsxBytes = await gdrive.readBytes!(jpXlsx);
    assert.equal(xlsxBytes.toString("utf8"), "RAW-XLSX-BYTES");

    // Pre-download size cap rejects before hitting network
    const reqCountBefore = requests.length;
    await assert.rejects(
      () => gdrive.readBytes!(jpXlsx, undefined, 64),
      (err: Error & { code?: string }) => err.code === "SKIPPED_TOO_LARGE",
    );
    assert.equal(requests.length, reqCountBefore);

    // Streaming cap aborts oversized export (where metadata size was 0)
    await assert.rejects(
      () => gdrive.readBytes!(vnDoc, undefined, 5),
      (err: Error & { code?: string }) => err.code === "SKIPPED_TOO_LARGE",
    );

    // Verify strictly read-only on drive endpoints (only POST was /oauth/token)
    assert.equal(
      requests.filter((r) => r.method !== "GET").every((r) => r.url === "/oauth/token"),
      true,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Microsoft Graph connector (sharepoint & onedrive): pagination, 429 retry, and auth error isolation", async () => {
  let retried = false;
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "POST" && url === "/ms-token") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ access_token: "ms-tok-1", expires_in: 3600 }));
      return;
    }
    if (url === "/v1.0/sites/site-1/drive/root:/SharedDocs:/children") {
      if (!retried) {
        retried = true;
        res.writeHead(429, { "retry-after": "0" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          "@odata.nextLink": `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1.0/page2`,
          value: [
            {
              id: "item-1",
              name: "Báo cáo.txt",
              size: 14,
              eTag: "etag-1",
              lastModifiedDateTime: "2026-02-01T00:00:00Z",
              file: { hashes: { sha256Hash: "sha-1" } },
              parentReference: { driveId: "drv-sp" },
            },
          ],
        }),
      );
      return;
    }
    if (url === "/v1.0/page2") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          value: [
            {
              id: "item-2",
              name: "見積書.csv",
              size: 10,
              eTag: "etag-2",
              file: {},
              parentReference: { driveId: "drv-sp" },
            },
          ],
        }),
      );
      return;
    }
    if (url === "/v1.0/drives/drv-sp/items/item-1/content") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(Buffer.from("Báo cáo Q1"));
      return;
    }
    if (url.startsWith("/v1.0/me/drive/root/children")) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const host = createPluginHost();
    host.registerPlugin(
      createCloudDrivePlugin({
        env: {
          KNOT_SYNC_CLOUD_DRIVE_LICENSE: CLOUD_DRIVE_TEST_LICENSE_SENTINEL,
          MS_SECRET: "secret-val",
        },
      }),
    );
    const sp = host.connectors.get("sharepoint")!;
    const spCfg = sp.parseSource(
      {
        id: "sp-1",
        type: "sharepoint",
        tenant_id: "t1",
        client_id: "c1",
        client_secret_env: "MS_SECRET",
        site_id: "site-1",
        folder_path: "SharedDocs",
        api_base_url: baseUrl,
        token_url: `${baseUrl}/ms-token`,
      },
      { baseDir: ".", index: 0 },
    );

    const spEntries = [];
    for await (const e of sp.scan(spCfg)) spEntries.push(e);
    assert.equal(retried, true);
    assert.equal(spEntries.length, 2);
    assert.equal(spEntries[0]?.hash, "sha-1");

    const bytes = await sp.readBytes!(spEntries[0]!);
    assert.equal(bytes.toString("utf8"), "Báo cáo Q1");

    // 401 on onedrive records AUTH_ERROR issue instead of crashing
    const od = host.connectors.get("onedrive")!;
    const odCfg = od.parseSource(
      {
        id: "od-1",
        type: "onedrive",
        tenant_id: "t1",
        client_id: "c1",
        client_secret_env: "MS_SECRET",
        api_base_url: baseUrl,
        token_url: `${baseUrl}/ms-token`,
      },
      { baseDir: ".", index: 0 },
    );
    const issues: ScanIssue[] = [];
    const odEntries = [];
    for await (const e of od.scan(odCfg, { onIssue: (i: ScanIssue) => issues.push(i) })) odEntries.push(e);
    assert.equal(odEntries.length, 0);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.code, "EACCES");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
