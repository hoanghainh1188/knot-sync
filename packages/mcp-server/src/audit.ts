import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { ConfigError } from "@hoanghainh/knot-sync-core";

export interface AuditEntry {
  timestamp: string;
  kind: "tool" | "resource";
  name: string;
  arguments?: Record<string, unknown>;
  uri?: string;
  resultCount: number;
  status: "ok" | "error";
  error?: string;
  /** HTTP client address when serving over HTTP. */
  clientIp?: string;
  /** HTTP User-Agent when present. */
  userAgent?: string;
  /** Per-request correlation id for HTTP mode. */
  requestId?: string;
}

/** Request-scoped fields merged into audit lines (HTTP mode). */
export interface AuditHttpContext {
  clientIp?: string;
  userAgent?: string;
  requestId?: string;
}

const auditHttpStore = new AsyncLocalStorage<AuditHttpContext>();

/** Run `fn` with HTTP audit fields available to {@link AuditLog.append}. */
export function runWithAuditHttpContext<T>(
  ctx: AuditHttpContext,
  fn: () => Promise<T>,
): Promise<T> {
  return auditHttpStore.run(ctx, fn);
}

/** Refuse writing the audit log under any configured source root. */
export function assertAuditPathOutsideSources(
  auditPath: string,
  sourcePaths: string[],
): string {
  const abs = resolve(auditPath);
  for (const src of sourcePaths) {
    if (!src) continue;
    const srcAbs = resolve(src);
    const prefix = srcAbs.endsWith(sep) ? srcAbs : srcAbs + sep;
    if (abs === srcAbs || abs.startsWith(prefix)) {
      throw new ConfigError(
        `Refusing to write MCP audit log inside source path "${src}". ` +
          `Set server.audit_log to a path outside configured sources.`,
      );
    }
  }
  return abs;
}

export class AuditLog {
  private ensureDir: Promise<void> | undefined;

  constructor(private readonly absPath: string) {}

  async append(entry: AuditEntry): Promise<void> {
    this.ensureDir ??= mkdir(dirname(this.absPath), { recursive: true })
      .then(() => undefined)
      .catch((err: unknown) => {
        this.ensureDir = undefined;
        throw err;
      });
    await this.ensureDir;
    const httpCtx = auditHttpStore.getStore();
    const merged: AuditEntry = httpCtx
      ? {
          ...entry,
          clientIp: entry.clientIp ?? httpCtx.clientIp,
          userAgent: entry.userAgent ?? httpCtx.userAgent,
          requestId: entry.requestId ?? httpCtx.requestId,
        }
      : entry;
    const line = JSON.stringify(merged) + "\n";
    await appendFile(this.absPath, line, "utf8");
  }
}
