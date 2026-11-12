import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { assertPathOutsideSources } from "./paths.js";
import type { LogLevel, LoggingConfig } from "./types.js";

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

/**
 * Narrow operational fields only — never document bodies, PII match text,
 * SQL rows, or secrets. Callers must not pass a `content` field.
 */
export interface SystemLogRecord {
  level: LogLevel;
  event: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  path?: string;
  storePath?: string;
  error?: string;
  host?: string;
  port?: number;
  count?: number;
  scanned?: number;
  extracted?: number;
  skipped?: number;
  pruned?: number;
  failed?: number;
}

export interface CreateSystemLoggerOptions {
  path: string;
  level: LogLevel;
  sourcePaths: string[];
}

/** Build a logger after refusing paths under configured sources. */
export function createSystemLogger(options: CreateSystemLoggerOptions): SystemLogger {
  const abs = assertPathOutsideSources(options.path, options.sourcePaths, {
    key: "logging.path",
    label: "system log",
  });
  return new SystemLogger(abs, options.level);
}

export function createSystemLoggerFromConfig(
  logging: LoggingConfig,
  sourcePaths: string[],
): SystemLogger {
  return createSystemLogger({
    path: logging.path,
    level: logging.level,
    sourcePaths,
  });
}

export class SystemLogger {
  private ensureDir: Promise<void> | undefined;

  constructor(
    readonly absPath: string,
    private readonly minLevel: LogLevel = "info",
  ) {}

  /** Append one JSONL line when `record.level` meets the configured minimum. */
  async append(record: SystemLogRecord): Promise<void> {
    if (LEVEL_RANK[record.level] > LEVEL_RANK[this.minLevel]) {
      return;
    }
    this.ensureDir ??= mkdir(dirname(this.absPath), { recursive: true })
      .then(() => undefined)
      .catch((err: unknown) => {
        this.ensureDir = undefined;
        throw err;
      });
    await this.ensureDir;

    const line: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: record.level,
      event: record.event,
    };
    if (record.command !== undefined) line.command = record.command;
    if (record.exitCode !== undefined) line.exitCode = record.exitCode;
    if (record.durationMs !== undefined) line.durationMs = record.durationMs;
    if (record.path !== undefined) line.path = record.path;
    if (record.storePath !== undefined) line.storePath = record.storePath;
    if (record.error !== undefined) line.error = record.error;
    if (record.host !== undefined) line.host = record.host;
    if (record.port !== undefined) line.port = record.port;
    if (record.count !== undefined) line.count = record.count;
    if (record.scanned !== undefined) line.scanned = record.scanned;
    if (record.extracted !== undefined) line.extracted = record.extracted;
    if (record.skipped !== undefined) line.skipped = record.skipped;
    if (record.pruned !== undefined) line.pruned = record.pruned;
    if (record.failed !== undefined) line.failed = record.failed;

    await appendFile(this.absPath, `${JSON.stringify(line)}\n`, "utf8");
  }
}
