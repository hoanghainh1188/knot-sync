import { createSign } from "node:crypto";
import {
  ConfigError,
  typeFromExt,
  type Connector,
  type ConnectorScanOptions,
  type FileEntry,
  type ScanIssue,
  type SourceConfig,
} from "@hoanghainh/knot-sync-core";
import {
  createInMemoryTokenCache,
  fetchWithRetry,
  matchesAllowedExtensions,
  normalizeCloudExt,
  readRequiredEnv,
  readResponseBufferBounded,
  type FetchLike,
} from "./http.js";
import {
  assertCloudDriveLicense,
  type CloudDriveLicenseCheckOptions,
  type CloudDriveSettings,
} from "./license.js";

const DEFAULT_GDRIVE_API_BASE = "https://www.googleapis.com";
const DEFAULT_GDRIVE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GDRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

const GOOGLE_WORKSPACE_EXPORTS: Record<string, { ext: string; mime: string }> = {
  "application/vnd.google-apps.document": {
    ext: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  "application/vnd.google-apps.spreadsheet": {
    ext: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  "application/vnd.google-apps.presentation": {
    ext: ".pdf",
    mime: "application/pdf",
  },
};

export interface GDriveSourceConfig {
  id: string;
  type: "gdrive";
  folderId: string;
  driveId?: string;
  serviceAccountEnv?: string;
  clientIdEnv?: string;
  clientSecretEnv?: string;
  refreshTokenEnv?: string;
  apiBaseUrl: string;
  tokenUrl: string;
  extensions?: string[];
  [key: string]: unknown;
}

interface GDriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
  modifiedTime?: string;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseExtensionsField(raw: unknown, id: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
    throw new ConfigError(`Source "${id}": extensions must be an array of strings.`);
  }
  return raw as string[];
}

export interface CreateGDriveConnectorOptions {
  getSettings: () => CloudDriveSettings;
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
  licenseOptions?: CloudDriveLicenseCheckOptions;
}

export function createGDriveConnector(opts: CreateGDriveConnectorOptions): Connector {
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchFn ?? fetch;
  const tokenCache = createInMemoryTokenCache();
  const parsedBySourceId = new Map<string, GDriveSourceConfig>();

  async function getAccessToken(cfg: GDriveSourceConfig, signal?: AbortSignal): Promise<string> {
    const cached = tokenCache.get(cfg.id);
    if (cached) return cached;

    let body: URLSearchParams;
    if (cfg.serviceAccountEnv) {
      const jsonStr = readRequiredEnv(env, cfg.serviceAccountEnv, `source "${cfg.id}"`);
      let sa: { client_email?: string; private_key?: string };
      try {
        sa = JSON.parse(jsonStr) as { client_email?: string; private_key?: string };
      } catch {
        throw new Error(`Invalid JSON in env "${cfg.serviceAccountEnv}" for source "${cfg.id}".`);
      }
      if (!sa.client_email || !sa.private_key) {
        throw new Error(
          `Service account JSON in "${cfg.serviceAccountEnv}" must contain client_email and private_key.`,
        );
      }
      const now = Math.floor(Date.now() / 1000);
      const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
      const payload = base64Url(
        JSON.stringify({
          iss: sa.client_email,
          scope: "https://www.googleapis.com/auth/drive.readonly",
          aud: cfg.tokenUrl,
          iat: now,
          exp: now + 3600,
        }),
      );
      const signer = createSign("RSA-SHA256");
      signer.update(`${header}.${payload}`);
      const sig = base64Url(signer.sign(sa.private_key));
      body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${payload}.${sig}`,
      });
    } else {
      const clientId = readRequiredEnv(env, cfg.clientIdEnv!, `source "${cfg.id}"`);
      const clientSecret = readRequiredEnv(env, cfg.clientSecretEnv!, `source "${cfg.id}"`);
      const refreshToken = readRequiredEnv(env, cfg.refreshTokenEnv!, `source "${cfg.id}"`);
      body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });
    }

    const res = await fetchWithRetry(
      fetchFn,
      cfg.tokenUrl,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      signal,
    );
    if (!res.ok) {
      throw new Error(`Google OAuth token exchange failed (${res.status} ${res.statusText}).`);
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error("Google OAuth response did not include access_token.");
    }
    tokenCache.set(cfg.id, data.access_token, data.expires_in);
    return data.access_token;
  }

  return {
    id: "gdrive",

    parseSource(raw: Record<string, unknown>): SourceConfig {
      const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
      if (!id) throw new ConfigError("gdrive source requires a non-empty string id.");

      if (raw.private_key !== undefined || raw.refresh_token !== undefined || raw.client_secret !== undefined) {
        throw new ConfigError(
          `Source "${id}": inline secrets are not allowed; reference environment variables via service_account_env or client_secret_env/refresh_token_env.`,
        );
      }

      const folderId =
        typeof (raw.folder_id ?? raw.folderId) === "string" &&
        String(raw.folder_id ?? raw.folderId).trim()
          ? String(raw.folder_id ?? raw.folderId).trim()
          : "root";
      const driveIdRaw = raw.drive_id ?? raw.driveId;
      const driveId = typeof driveIdRaw === "string" && driveIdRaw.trim() ? driveIdRaw.trim() : undefined;

      const serviceAccountEnvRaw = raw.service_account_env ?? raw.serviceAccountEnv;
      const clientIdEnvRaw = raw.client_id_env ?? raw.clientIdEnv;
      const clientSecretEnvRaw = raw.client_secret_env ?? raw.clientSecretEnv;
      const refreshTokenEnvRaw = raw.refresh_token_env ?? raw.refreshTokenEnv;

      const serviceAccountEnv =
        typeof serviceAccountEnvRaw === "string" && serviceAccountEnvRaw.trim()
          ? serviceAccountEnvRaw.trim()
          : undefined;
      const clientIdEnv =
        typeof clientIdEnvRaw === "string" && clientIdEnvRaw.trim() ? clientIdEnvRaw.trim() : undefined;
      const clientSecretEnv =
        typeof clientSecretEnvRaw === "string" && clientSecretEnvRaw.trim()
          ? clientSecretEnvRaw.trim()
          : undefined;
      const refreshTokenEnv =
        typeof refreshTokenEnvRaw === "string" && refreshTokenEnvRaw.trim()
          ? refreshTokenEnvRaw.trim()
          : undefined;

      if (!serviceAccountEnv && !(clientIdEnv && clientSecretEnv && refreshTokenEnv)) {
        throw new ConfigError(
          `Source "${id}": configure either service_account_env or all of client_id_env, client_secret_env, and refresh_token_env.`,
        );
      }

      const apiBaseRaw = raw.api_base_url ?? raw.apiBaseUrl;
      const tokenUrlRaw = raw.token_url ?? raw.tokenUrl;
      const apiBaseUrl = (typeof apiBaseRaw === "string" && apiBaseRaw.trim()
        ? apiBaseRaw.trim()
        : DEFAULT_GDRIVE_API_BASE
      ).replace(/\/+$/, "");
      const tokenUrl =
        typeof tokenUrlRaw === "string" && tokenUrlRaw.trim()
          ? tokenUrlRaw.trim()
          : DEFAULT_GDRIVE_TOKEN_URL;

      const parsed: GDriveSourceConfig = {
        id,
        type: "gdrive",
        folderId,
        ...(driveId ? { driveId } : {}),
        ...(serviceAccountEnv ? { serviceAccountEnv } : {}),
        ...(clientIdEnv ? { clientIdEnv, clientSecretEnv, refreshTokenEnv } : {}),
        apiBaseUrl,
        tokenUrl,
        extensions: parseExtensionsField(raw.extensions, id),
      };
      parsedBySourceId.set(id, parsed);
      return parsed as unknown as SourceConfig;
    },

    async *scan(source: SourceConfig, options?: ConnectorScanOptions): AsyncGenerator<FileEntry> {
      assertCloudDriveLicense(opts.getSettings(), env, opts.licenseOptions);
      const cfg = (parsedBySourceId.get(source.id) ?? source) as unknown as GDriveSourceConfig;
      parsedBySourceId.set(cfg.id, cfg);

      let token: string;
      try {
        token = await getAccessToken(cfg);
      } catch (err) {
        options?.onIssue?.({
          sourceId: cfg.id,
          path: cfg.folderId,
          code: "EACCES",
          message: (err as Error).message,
        });
        return;
      }

      const queue: Array<{ folderId: string; prefix: string }> = [
        { folderId: cfg.folderId, prefix: "" },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;
        let pageToken: string | undefined;

        do {
          const params = new URLSearchParams({
            q: `'${current.folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
            fields: "nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)",
            pageSize: "200",
            supportsAllDrives: "true",
            includeItemsFromAllDrives: "true",
          });
          if (cfg.driveId) {
            params.set("driveId", cfg.driveId);
            params.set("corpora", "drive");
          }
          if (pageToken) params.set("pageToken", pageToken);

          const url = `${cfg.apiBaseUrl}/drive/v3/files?${params.toString()}`;
          let res: Response;
          try {
            res = await fetchWithRetry(fetchFn, url, {
              method: "GET",
              headers: { authorization: `Bearer ${token}` },
            });
          } catch (err) {
            options?.onIssue?.({
              sourceId: cfg.id,
              path: current.prefix || current.folderId,
              code: "OTHER",
              message: (err as Error).message,
            });
            break;
          }

          if (!res.ok) {
            const code: ScanIssue["code"] =
              res.status === 401 || res.status === 403 ? "EACCES" : res.status === 404 ? "ENOENT" : "OTHER";
            options?.onIssue?.({
              sourceId: cfg.id,
              path: current.prefix || current.folderId,
              code,
              message: `Google Drive list failed (${res.status} ${res.statusText}).`,
            });
            break;
          }

          const payload = (await res.json()) as {
            nextPageToken?: string;
            files?: GDriveFileItem[];
          };
          pageToken = payload.nextPageToken;

          for (const item of payload.files ?? []) {
            const relPath = current.prefix ? `${current.prefix}/${item.name}` : item.name;
            if (item.mimeType === GDRIVE_FOLDER_MIME) {
              queue.push({ folderId: item.id, prefix: relPath });
              continue;
            }

            const exportSpec = GOOGLE_WORKSPACE_EXPORTS[item.mimeType];
            const ext = exportSpec ? exportSpec.ext : normalizeCloudExt(item.name);
            if (!ext || !matchesAllowedExtensions(ext, cfg.extensions)) continue;

            const normalizedRel = exportSpec && !relPath.toLowerCase().endsWith(exportSpec.ext)
              ? `${relPath}${exportSpec.ext}`
              : relPath;
            const size = item.size ? Number(item.size) : 0;
            const mtimeMs = item.modifiedTime ? Date.parse(item.modifiedTime) || 0 : 0;
            const hash = options?.hash === false
              ? null
              : item.md5Checksum ?? (item.modifiedTime ? `${item.id}:${item.modifiedTime}` : item.id);

            yield {
              sourceId: cfg.id,
              relPath: normalizedRel,
              absPath: exportSpec
                ? `gdrive://${item.id}?export=${encodeURIComponent(exportSpec.mime)}`
                : `gdrive://${item.id}`,
              ext,
              type: typeFromExt(ext),
              size: Number.isFinite(size) ? size : 0,
              mtimeMs,
              hash,
            };
          }
        } while (pageToken);
      }
    },

    async readBytes(file: FileEntry, signal?: AbortSignal, maxBytes?: number): Promise<Buffer> {
      assertCloudDriveLicense(opts.getSettings(), env, opts.licenseOptions);
      if (maxBytes && maxBytes > 0 && file.size > maxBytes) {
        throw Object.assign(
          new Error(`Skipped "${file.relPath}" (${file.size} bytes) — over extraction.maxFileSizeMb.`),
          { code: "SKIPPED_TOO_LARGE" },
        );
      }

      const cfg = parsedBySourceId.get(file.sourceId);
      if (!cfg) {
        throw new Error(`No parsed gdrive configuration found for source "${file.sourceId}".`);
      }

      const parsedUrl = new URL(file.absPath);
      const fileId = parsedUrl.hostname || parsedUrl.pathname.replace(/^\/+/, "");
      const exportMime = parsedUrl.searchParams.get("export");
      const token = await getAccessToken(cfg, signal);

      const endpoint = exportMime
        ? `${cfg.apiBaseUrl}/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`
        : `${cfg.apiBaseUrl}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

      const res = await fetchWithRetry(
        fetchFn,
        endpoint,
        {
          method: "GET",
          headers: { authorization: `Bearer ${token}` },
        },
        signal,
      );
      if (!res.ok) {
        throw new Error(`Google Drive download failed for "${file.relPath}" (${res.status} ${res.statusText}).`);
      }
      return readResponseBufferBounded(res, maxBytes, file.relPath);
    },
  };
}
