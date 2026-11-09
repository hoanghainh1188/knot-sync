import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { checkBearerAuth, missingApiKeyMessage, readApiKeyFromEnv } from "./auth.js";
import { runWithAuditHttpContext } from "./audit.js";
import {
  createKnotMcpServer,
  type CreateKnotMcpServerOptions,
} from "./server.js";

export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 3000;
export const MCP_HTTP_PATH = "/mcp";

export interface ServeHttpOptions extends CreateKnotMcpServerOptions {
  /** Bind address (default 127.0.0.1). Named bindHost to avoid clashing with PluginHost `host`. */
  bindHost?: string;
  port?: number;
  /** Override API key (defaults to env KNOT_SYNC_API_KEY). */
  apiKey?: string;
  /** Invoked after the server begins listening (tests). */
  onListening?: (info: { host: string; port: number }) => void;
  /** Optional abort to stop the HTTP server (tests). */
  signal?: AbortSignal;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  closeServer: () => Promise<void>;
}

function headerValue(
  headers: IncomingMessage["headers"],
  name: string,
): string | undefined {
  const raw = headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : undefined;
}

function clientIpOf(req: IncomingMessage): string | undefined {
  const remote = req.socket.remoteAddress;
  return remote || undefined;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/** Extract hostname from a Host header (supports IPv6 bracket and bare forms). */
export function hostOnlyFromHeader(hostHeader: string): string {
  const lower = hostHeader.toLowerCase();
  if (lower.startsWith("[")) {
    const end = lower.indexOf("]");
    return end < 0 ? lower : lower.slice(0, end + 1);
  }
  // IPv4:port → strip port. Bare IPv6 (e.g. ::1) has multiple colons and no port.
  const colon = lower.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(lower.slice(colon + 1)) && lower.indexOf(":") === colon) {
    return lower.slice(0, colon);
  }
  return lower;
}

/** Validate Host header when bound to loopback (DNS rebinding mitigation). */
export function isAllowedLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const hostOnly = hostOnlyFromHeader(hostHeader);
  return (
    hostOnly === "127.0.0.1" ||
    hostOnly === "localhost" ||
    hostOnly === "[::1]" ||
    hostOnly === "::1"
  );
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Serve MCP over Streamable HTTP at `/mcp` with Bearer API key auth.
 * Resolves when the HTTP server closes (signal or close()).
 */
export async function serveHttp(options: ServeHttpOptions): Promise<void> {
  const bindHost = options.bindHost ?? DEFAULT_HTTP_HOST;
  const port = options.port ?? DEFAULT_HTTP_PORT;
  const apiKeyRaw = options.apiKey ?? readApiKeyFromEnv();
  if (!apiKeyRaw) {
    throw new Error(missingApiKeyMessage());
  }
  const apiKey: string = apiKeyRaw;

  const sessions = new Map<string, SessionEntry>();
  const enforceLoopbackHost = isLoopbackHost(bindHost);

  const httpServer: Server = createServer((req, res) => {
    handleHttpRequest(req, res).catch((err) => {
      process.stderr.write(
        `[knot-sync] unhandled HTTP error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });
  });

  async function handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const requestId = randomUUID();
    const userAgent = headerValue(req.headers, "user-agent");
    const clientIp = clientIpOf(req);

    await runWithAuditHttpContext({ requestId, userAgent, clientIp }, async () => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (url.pathname !== MCP_HTTP_PATH) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Not found");
          return;
        }

        if (enforceLoopbackHost && !isAllowedLoopbackHostHeader(headerValue(req.headers, "host"))) {
          sendJson(res, 403, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Forbidden host header" },
            id: null,
          });
          return;
        }

        const authorization = headerValue(req.headers, "authorization");
        if (!checkBearerAuth(authorization, apiKey)) {
          res.writeHead(401, {
            "content-type": "application/json",
            "www-authenticate": 'Bearer realm="knot-sync"',
          });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32001, message: "Unauthorized" },
              id: null,
            }),
          );
          return;
        }

        const sessionHeader = headerValue(req.headers, "mcp-session-id");
        if (sessionHeader && sessions.has(sessionHeader)) {
          const entry = sessions.get(sessionHeader)!;
          await entry.transport.handleRequest(req, res);
          return;
        }

        if (req.method === "POST" && !sessionHeader) {
          const sessionId = randomUUID();
          const mcpServer = createKnotMcpServer(options);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId,
          });
          const entry: SessionEntry = {
            transport,
            closeServer: () => mcpServer.close(),
          };
          sessions.set(sessionId, entry);
          transport.onclose = () => {
            sessions.delete(sessionId);
            void mcpServer.close().catch(() => undefined);
          };
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res);
          return;
        }

        if (sessionHeader && !sessions.has(sessionHeader)) {
          sendJson(res, 404, {
            jsonrpc: "2.0",
            error: { code: -32001, message: "Session not found" },
            id: null,
          });
          return;
        }

        sendJson(res, 400, {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Bad Request: invalid session or method" },
          id: null,
        });
      } catch (err) {
        if (!res.headersSent) {
          sendJson(res, 500, {
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : "Internal server error",
            },
            id: null,
          });
        }
      }
    });
  }

  const shutdownHttp = () => {
    httpServer.closeAllConnections();
    httpServer.close();
  };
  const onSignal = () => {
    shutdownHttp();
  };

  if (options.signal?.aborted) {
    return;
  }
  options.signal?.addEventListener("abort", shutdownHttp, { once: true });

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, bindHost, () => {
        httpServer.off("error", reject);
        const addr = httpServer.address();
        const boundPort =
          typeof addr === "object" && addr ? addr.port : port;
        options.onListening?.({ host: bindHost, port: boundPort });
        resolve();
      });
    });

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    await new Promise<void>((resolve) => {
      httpServer.once("close", () => resolve());
    });
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    options.signal?.removeEventListener("abort", shutdownHttp);
    for (const entry of sessions.values()) {
      await entry.transport.close().catch(() => undefined);
      await entry.closeServer().catch(() => undefined);
    }
    sessions.clear();
  }
}
