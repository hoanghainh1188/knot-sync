import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCatalogFile,
  parseCatalogYaml,
  stringifyCatalog,
  writeCatalogFile,
  type CatalogDocument,
} from "@hoanghainh/knot-sync-catalog";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";

export const LOOPBACK_HOST = "127.0.0.1";
export const DEFAULT_UI_PORT = 8787;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface CreateUiServerOptions {
  /** Absolute path to knot-sync.catalog.yaml. */
  catalogPath: string;
  /** Optional path to the SQLite store for read-only Document Explorer & Health views. */
  storePath?: string;
  /** Directory of built static assets (Vite outDir). */
  staticDir?: string;
  /** Listen port (default 8787). */
  port?: number;
  /** Must be loopback; default 127.0.0.1. */
  host?: string;
}

export interface UiServer {
  host: string;
  port: number;
  url: string;
  server: Server;
  close: () => Promise<void>;
}

/** Resolve published/built static directory next to this package. */
export function resolveStaticDir(fromModuleUrl = import.meta.url): string {
  const here = dirnameOf(fromModuleUrl);
  // dist/server.js → ../static ; or src during weird loads
  const candidate = resolve(here, "..", "static");
  if (existsSync(candidate)) return candidate;
  return resolve(here, "../../static");
}

function dirnameOf(moduleUrl: string): string {
  return fileURLToPath(new URL(".", moduleUrl));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  res.end(text);
}

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MiB — catalogs stay well under this

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function safeStaticPath(staticDir: string, urlPath: string): string | null {
  const decoded = decodeURIComponent((urlPath.split("?")[0] || "/"));
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const normalizedRoot = normalize(resolve(staticDir));
  const normalizedAbs = normalize(resolve(staticDir, rel));
  const relCheck = relative(normalizedRoot, normalizedAbs);
  if (relCheck.startsWith("..") || relCheck.includes(`..${sep}`)) return null;
  return normalizedAbs;
}

async function serveStatic(
  staticDir: string,
  urlPath: string,
  res: ServerResponse,
): Promise<void> {
  let filePath = safeStaticPath(staticDir, urlPath);
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA fallback
    filePath = join(staticDir, "index.html");
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const type = MIME[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  createReadStream(filePath).pipe(res);
}

/**
 * Create a loopback-only HTTP server for the catalog review UI.
 */
export async function createUiServer(options: CreateUiServerOptions): Promise<UiServer> {
  const host = options.host ?? LOOPBACK_HOST;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error(
      `UI server host must be loopback (127.0.0.1), got "${host}". ` +
        `Do not bind to 0.0.0.0 or LAN interfaces.`,
    );
  }
  const listenHost = host === "localhost" || host === "::1" ? LOOPBACK_HOST : host;
  const port = options.port ?? DEFAULT_UI_PORT;
  const staticDir = options.staticDir ?? resolveStaticDir();
  const catalogPath = options.catalogPath;
  const storePath = options.storePath;

  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", `http://${listenHost}`);

      if (url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/documents") {
        if (method !== "GET") {
          res.writeHead(405).end("Method not allowed");
          return;
        }
        if (!storePath || !existsSync(storePath)) {
          sendJson(res, 200, {
            storeExists: false,
            total: 0,
            limit: 25,
            offset: 0,
            documents: [],
            sources: [],
            types: [],
          });
          return;
        }
        const rawLimit = Number(url.searchParams.get("limit") ?? 25);
        const rawOffset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number.isFinite(rawLimit) ? rawLimit : 25;
        const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
        const store = new Store(storePath);
        try {
          const result = store.listSanitizedDocuments({
            q: url.searchParams.get("q") ?? undefined,
            sourceId: url.searchParams.get("sourceId") ?? undefined,
            type: url.searchParams.get("type") ?? undefined,
            guardRisk: url.searchParams.get("guardRisk") ?? undefined,
            limit,
            offset,
          });
          const sources = (
            store.db
              .prepare("SELECT DISTINCT source_id FROM documents ORDER BY source_id ASC")
              .all() as Array<{ source_id: string }>
          ).map((r) => r.source_id);
          const types = (
            store.db
              .prepare("SELECT DISTINCT type FROM documents ORDER BY type ASC")
              .all() as Array<{ type: string }>
          ).map((r) => r.type);
          sendJson(res, 200, {
            storeExists: true,
            ...result,
            sources,
            types,
          });
        } finally {
          store.close();
        }
        return;
      }

      if (url.pathname === "/api/health-summary") {
        if (method !== "GET") {
          res.writeHead(405).end("Method not allowed");
          return;
        }
        if (!storePath || !existsSync(storePath)) {
          sendJson(res, 200, {
            storeExists: false,
            totalDocuments: 0,
            sources: [],
            scanIssues: [],
            runIssues: [],
          });
          return;
        }
        const store = new Store(storePath);
        try {
          const stats = store.listAllSourceStats();
          const docCounts = store.countDocumentsBySource();
          const sources = stats.map((s) => ({
            ...s,
            documentCount: docCounts[s.sourceId] ?? 0,
          }));
          const scanIssues = store.listScanIssues();
          const runIssues = store.listRunIssues();
          const totalDocuments = store.documentCount();
          sendJson(res, 200, {
            storeExists: true,
            totalDocuments,
            sources,
            scanIssues,
            runIssues,
          });
        } finally {
          store.close();
        }
        return;
      }

      if (url.pathname === "/api/catalog" && method === "GET") {
        const doc = await loadCatalogFile(catalogPath);
        sendJson(res, 200, doc);
        return;
      }

      if (url.pathname === "/api/catalog" && method === "PUT") {
        let raw: string;
        try {
          raw = await readBody(req);
        } catch (err) {
          const msg = (err as Error).message || String(err);
          sendJson(res, msg.includes("exceeds") ? 413 : 400, { error: msg });
          return;
        }
        let doc: CatalogDocument;
        try {
          const parsed = JSON.parse(raw) as unknown;
          // Re-parse through YAML path via stringify/parse to validate shape.
          doc = parseCatalogYaml(stringifyCatalog(parsed as CatalogDocument));
        } catch (err) {
          sendJson(res, 400, {
            error: `Invalid catalog JSON: ${(err as Error).message}`,
          });
          return;
        }
        await writeCatalogFile(catalogPath, doc);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === "GET" || method === "HEAD") {
        await serveStatic(staticDir, url.pathname, res);
        return;
      }

      res.writeHead(405).end("Method not allowed");
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message || String(err) });
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use on ${listenHost}. ` +
              `Stop the other process or pass --port <free-port>.`,
          ),
        );
        return;
      }
      reject(err);
    });
    server.listen(port, listenHost, () => resolvePromise());
  });

  const address = server.address();
  const boundPort =
    address && typeof address === "object" ? address.port : port;

  return {
    host: listenHost,
    port: boundPort,
    url: `http://${listenHost}:${boundPort}/`,
    server,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

/** Test helper: read index.html from static dir. */
export async function readStaticIndex(staticDir?: string): Promise<string> {
  const dir = staticDir ?? resolveStaticDir();
  return readFile(join(dir, "index.html"), "utf8");
}
