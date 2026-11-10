import {
  createSystemLoggerFromConfig,
  type LoggingConfig,
  type SystemLogRecord,
  type SystemLogger,
} from "@hoanghainh/knot-sync-core";

/** Minimal stderr sink (matches CLI `Io.err`). */
export interface SystemLogIo {
  err: (text: string) => void;
}

/** Truncate/sanitize free-form error text before it reaches the system log. */
export function sanitizeSystemLogError(err: unknown, maxLen = 200): string {
  const raw = err instanceof Error ? err.message : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 3))}...`;
}

/** Run a command with start/end/error system log lines; log I/O errors go to stderr. */
export async function withSystemLog(
  options: {
    command: string;
    logging: LoggingConfig;
    sourcePaths: string[];
    io: SystemLogIo;
    /** Localized write-failure formatter; English default when omitted. */
    formatWriteFailed?: (detail: string) => string;
  },
  fn: (log: SystemLogger) => Promise<number>,
): Promise<number> {
  const started = Date.now();
  const log = createSystemLoggerFromConfig(options.logging, options.sourcePaths);
  const formatWriteFailed =
    options.formatWriteFailed ??
    ((detail: string) =>
      `System log write failed: ${detail}. The command result is unchanged.`);

  await appendSystemLogSafe(log, options.io, {
    level: "info",
    event: "command.start",
    command: options.command,
  }, formatWriteFailed);

  try {
    const code = await fn(log);
    await appendSystemLogSafe(
      log,
      options.io,
      {
        level: code === 0 ? "info" : "error",
        event: code === 0 ? "command.end" : "command.error",
        command: options.command,
        exitCode: code,
        durationMs: Date.now() - started,
      },
      formatWriteFailed,
    );
    return code;
  } catch (err) {
    await appendSystemLogSafe(
      log,
      options.io,
      {
        level: "error",
        event: "command.error",
        command: options.command,
        error: sanitizeSystemLogError(err),
        durationMs: Date.now() - started,
      },
      formatWriteFailed,
    );
    throw err;
  }
}

/** Append a system log line; failures go to stderr and do not throw. */
export async function appendSystemLogSafe(
  log: SystemLogger,
  io: SystemLogIo,
  record: SystemLogRecord,
  formatWriteFailed: (detail: string) => string = (detail) =>
    `System log write failed: ${detail}. The command result is unchanged.`,
): Promise<void> {
  try {
    await log.append(record);
  } catch (err) {
    io.err(formatWriteFailed(sanitizeSystemLogError(err)));
  }
}
