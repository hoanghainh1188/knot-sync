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
  constructor(private readonly absPath: string) {}

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(dirname(this.absPath), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    await appendFile(this.absPath, line, "utf8");
  }
}
