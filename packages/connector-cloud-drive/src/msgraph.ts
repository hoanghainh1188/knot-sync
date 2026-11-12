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

const DEFAULT_GRAPH_API_BASE = "https://graph.microsoft.com";

export type MsGraphKind = "sharepoint" | "onedrive";

export interface MsGraphSourceConfig {
  id: string;
  type: MsGraphKind;
  tenantId?: string;
  tenantIdEnv?: string;
  clientId?: string;
  clientIdEnv?: string;
  clientSecretEnv: string;
  driveId?: string;
  siteId?: string;
  userId?: string;
  folderPath?: string;
  apiBaseUrl: string;
  tokenUrl?: string;
  extensions?: string[];
  [key: string]: unknown;
}

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: { hashes?: { sha256Hash?: string; quickXorHash?: string } };
  parentReference?: { driveId?: string };
}

function parseExtensionsField(raw: unknown, id: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
    throw new ConfigError(`Source "${id}": extensions must be an array of strings.`);
  }
  return raw as string[];
}

export interface CreateMsGraphConnectorOptions {
  kind: MsGraphKind;
  getSettings: () => CloudDriveSettings;
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
  licenseOptions?: CloudDriveLicenseCheckOptions;
}

export function createMsGraphConnector(opts: CreateMsGraphConnectorOptions): Connector {
  const env = opts.env ?? process.env;
  const fetchFn = opts.fetchFn ?? fetch;
  const tokenCache = createInMemoryTokenCache();
  const parsedBySourceId = new Map<string, MsGraphSourceConfig>();

  function resolveValueOrEnv(
    direct: string | undefined,
    envName: string | undefined,
    label: string,
  ): string {
    if (direct) return direct;
    if (envName) return readRequiredEnv(env, envName, label);
    throw new Error(`Missing ${label} configuration.`);
  }

  async function getAccessToken(cfg: MsGraphSourceConfig, signal?: AbortSignal): Promise<string> {
    const cached = tokenCache.get(cfg.id);
    if (cached) return cached;

    const tenantId = resolveValueOrEnv(cfg.tenantId, cfg.tenantIdEnv, `tenant_id for "${cfg.id}"`);
    const clientId = resolveValueOrEnv(cfg.clientId, cfg.clientIdEnv, `client_id for "${cfg.id}"`);
    const clientSecret = readRequiredEnv(env, cfg.clientSecretEnv, `source "${cfg.id}"`);

    const tokenUrl =
      cfg.tokenUrl ?? `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    });

    const res = await fetchWithRetry(
      fetchFn,
      tokenUrl,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
      signal,
    );
    if (!res.ok) {
      throw new Error(`Microsoft Graph token exchange failed (${res.status} ${res.statusText}).`);
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error("Microsoft Graph OAuth response did not include access_token.");
    }
    tokenCache.set(cfg.id, data.access_token, data.expires_in);
    return data.access_token;
  }

  function initialListUrl(cfg: MsGraphSourceConfig): string {
    let driveRoot: string;
    if (cfg.driveId) {
      driveRoot = `${cfg.apiBaseUrl}/v1.0/drives/${encodeURIComponent(cfg.driveId)}/root`;
    } else if (cfg.siteId) {
      driveRoot = `${cfg.apiBaseUrl}/v1.0/sites/${encodeURIComponent(cfg.siteId)}/drive/root`;
    } else if (cfg.userId) {
      driveRoot = `${cfg.apiBaseUrl}/v1.0/users/${encodeURIComponent(cfg.userId)}/drive/root`;
    } else {
      driveRoot = `${cfg.apiBaseUrl}/v1.0/me/drive/root`;
    }

    if (cfg.folderPath) {
      const clean = cfg.folderPath.replace(/^\/+|\/+$/g, "");
      if (clean) {
        const encoded = clean.split("/").map(encodeURIComponent).join("/");
        return `${driveRoot}:/${encoded}:/children`;
      }
    }
    return `${driveRoot}/children`;
  }

  function itemChildrenUrl(cfg: MsGraphSourceConfig, driveId: string | undefined, itemId: string): string {
    const resolvedDrive = driveId ?? cfg.driveId;
    if (resolvedDrive) {
      return `${cfg.apiBaseUrl}/v1.0/drives/${encodeURIComponent(resolvedDrive)}/items/${encodeURIComponent(itemId)}/children`;
    }
    if (cfg.siteId) {
      return `${cfg.apiBaseUrl}/v1.0/sites/${encodeURIComponent(cfg.siteId)}/drive/items/${encodeURIComponent(itemId)}/children`;
    }
    if (cfg.userId) {
      return `${cfg.apiBaseUrl}/v1.0/users/${encodeURIComponent(cfg.userId)}/drive/items/${encodeURIComponent(itemId)}/children`;
    }
    return `${cfg.apiBaseUrl}/v1.0/me/drive/items/${encodeURIComponent(itemId)}/children`;
  }

  return {
    id: opts.kind,

    parseSource(raw: Record<string, unknown>): SourceConfig {
      const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
      if (!id) throw new ConfigError(`${opts.kind} source requires a non-empty string id.`);

      if (raw.client_secret !== undefined || raw.clientSecret !== undefined) {
        throw new ConfigError(
          `Source "${id}": inline client_secret is not allowed; reference an environment variable via client_secret_env.`,
        );
      }

      const tenantId =
        typeof (raw.tenant_id ?? raw.tenantId) === "string"
          ? String(raw.tenant_id ?? raw.tenantId).trim() || undefined
          : undefined;
      const tenantIdEnv =
        typeof (raw.tenant_id_env ?? raw.tenantIdEnv) === "string"
          ? String(raw.tenant_id_env ?? raw.tenantIdEnv).trim() || undefined
          : undefined;
      const clientId =
        typeof (raw.client_id ?? raw.clientId) === "string"
          ? String(raw.client_id ?? raw.clientId).trim() || undefined
          : undefined;
      const clientIdEnv =
        typeof (raw.client_id_env ?? raw.clientIdEnv) === "string"
          ? String(raw.client_id_env ?? raw.clientIdEnv).trim() || undefined
          : undefined;
      const clientSecretEnv =
        typeof (raw.client_secret_env ?? raw.clientSecretEnv) === "string"
          ? String(raw.client_secret_env ?? raw.clientSecretEnv).trim()
          : "";

      if ((!tenantId && !tenantIdEnv) || (!clientId && !clientIdEnv) || !clientSecretEnv) {
        throw new ConfigError(
          `Source "${id}": ${opts.kind} requires tenant_id/tenant_id_env, client_id/client_id_env, and client_secret_env.`,
        );
      }

      const driveId =
        typeof (raw.drive_id ?? raw.driveId) === "string"
          ? String(raw.drive_id ?? raw.driveId).trim() || undefined
          : undefined;
      const siteId =
        typeof (raw.site_id ?? raw.siteId) === "string"
          ? String(raw.site_id ?? raw.siteId).trim() || undefined
          : undefined;
      const userId =
        typeof (raw.user_id ?? raw.userId) === "string"
          ? String(raw.user_id ?? raw.userId).trim() || undefined
          : undefined;
      const folderPath =
        typeof (raw.folder_path ?? raw.folderPath) === "string"
          ? String(raw.folder_path ?? raw.folderPath).trim() || undefined
          : undefined;

      if (opts.kind === "sharepoint" && !driveId && !siteId) {
        throw new ConfigError(`Source "${id}": sharepoint requires site_id or drive_id.`);
      }

      const apiBaseRaw = raw.api_base_url ?? raw.apiBaseUrl;
      const tokenUrlRaw = raw.token_url ?? raw.tokenUrl;
      const apiBaseUrl = (typeof apiBaseRaw === "string" && apiBaseRaw.trim()
        ? apiBaseRaw.trim()
        : DEFAULT_GRAPH_API_BASE
      ).replace(/\/+$/, "");
      const tokenUrl =
        typeof tokenUrlRaw === "string" && tokenUrlRaw.trim() ? tokenUrlRaw.trim() : undefined;

      const parsed: MsGraphSourceConfig = {
        id,
        type: opts.kind,
        ...(tenantId ? { tenantId } : {}),
        ...(tenantIdEnv ? { tenantIdEnv } : {}),
        ...(clientId ? { clientId } : {}),
        ...(clientIdEnv ? { clientIdEnv } : {}),
        clientSecretEnv,
        ...(driveId ? { driveId } : {}),
        ...(siteId ? { siteId } : {}),
        ...(userId ? { userId } : {}),
        ...(folderPath ? { folderPath } : {}),
        apiBaseUrl,
        ...(tokenUrl ? { tokenUrl } : {}),
        extensions: parseExtensionsField(raw.extensions, id),
      };
      parsedBySourceId.set(id, parsed);
      return parsed as unknown as SourceConfig;
    },

    async *scan(source: SourceConfig, options?: ConnectorScanOptions): AsyncGenerator<FileEntry> {
      assertCloudDriveLicense(opts.getSettings(), env, opts.licenseOptions);
      const cfg = (parsedBySourceId.get(source.id) ?? source) as unknown as MsGraphSourceConfig;
      parsedBySourceId.set(cfg.id, cfg);

      let token: string;
      try {
        token = await getAccessToken(cfg);
      } catch (err) {
        options?.onIssue?.({
          sourceId: cfg.id,
          path: cfg.folderPath ?? cfg.driveId ?? cfg.siteId ?? cfg.id,
          code: "EACCES",
          message: (err as Error).message,
        });
        return;
      }

      const queue: Array<{ url: string; prefix: string }> = [
        { url: initialListUrl(cfg), prefix: "" },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;
        let nextUrl: string | undefined = current.url;

        while (nextUrl) {
          let res: Response;
          try {
            res = await fetchWithRetry(fetchFn, nextUrl, {
              method: "GET",
              headers: { authorization: `Bearer ${token}` },
            });
          } catch (err) {
            options?.onIssue?.({
              sourceId: cfg.id,
              path: current.prefix || cfg.id,
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
              path: current.prefix || cfg.id,
              code,
              message: `Microsoft Graph list failed (${res.status} ${res.statusText}).`,
            });
            break;
          }

          const payload = (await res.json()) as {
            "@odata.nextLink"?: string;
            value?: GraphDriveItem[];
          };
          nextUrl = payload["@odata.nextLink"];

          for (const item of payload.value ?? []) {
            const relPath = current.prefix ? `${current.prefix}/${item.name}` : item.name;
            const driveKey = item.parentReference?.driveId ?? cfg.driveId;
            if (item.folder) {
              queue.push({
                url: itemChildrenUrl(cfg, driveKey, item.id),
                prefix: relPath,
              });
              continue;
            }
            if (!item.file) continue;

            const ext = normalizeCloudExt(item.name);
            if (!ext || !matchesAllowedExtensions(ext, cfg.extensions)) continue;

            const driveSegment = driveKey ?? (cfg.siteId ? "_site" : "_me");
            const hash =
              options?.hash === false
                ? null
                : item.file.hashes?.sha256Hash ??
                  item.eTag ??
                  (item.lastModifiedDateTime ? `${item.id}:${item.lastModifiedDateTime}` : item.id);
            const mtimeMs = item.lastModifiedDateTime
              ? Date.parse(item.lastModifiedDateTime) || 0
              : 0;

            yield {
              sourceId: cfg.id,
              relPath,
              absPath: `msgraph://${encodeURIComponent(driveSegment)}/${encodeURIComponent(item.id)}`,
              ext,
              type: typeFromExt(ext),
              size: typeof item.size === "number" ? item.size : 0,
              mtimeMs,
              hash,
            };
          }
        }
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
        throw new Error(`No parsed ${opts.kind} configuration found for source "${file.sourceId}".`);
      }

      const parsedUrl = new URL(file.absPath);
      const driveSegment = decodeURIComponent(parsedUrl.hostname);
      const itemId = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
      const token = await getAccessToken(cfg, signal);

      let endpoint: string;
      if (driveSegment === "_site" && cfg.siteId) {
        endpoint = `${cfg.apiBaseUrl}/v1.0/sites/${encodeURIComponent(cfg.siteId)}/drive/items/${encodeURIComponent(itemId)}/content`;
      } else if (driveSegment === "_me") {
        endpoint = cfg.userId
          ? `${cfg.apiBaseUrl}/v1.0/users/${encodeURIComponent(cfg.userId)}/drive/items/${encodeURIComponent(itemId)}/content`
          : `${cfg.apiBaseUrl}/v1.0/me/drive/items/${encodeURIComponent(itemId)}/content`;
      } else {
        endpoint = `${cfg.apiBaseUrl}/v1.0/drives/${encodeURIComponent(driveSegment)}/items/${encodeURIComponent(itemId)}/content`;
      }

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
        throw new Error(
          `Microsoft Graph download failed for "${file.relPath}" (${res.status} ${res.statusText}).`,
        );
      }
      return readResponseBufferBounded(res, maxBytes, file.relPath);
    },
  };
}
