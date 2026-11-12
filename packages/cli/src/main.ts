import { createRequire } from "node:module";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadCatalogFile } from "@hoanghainh/knot-sync-catalog";
import {
  ConfigError,
  DEFAULT_CONFIG_FILE,
  loadConfig,
  resolveConfig,
  sourceRootPaths,
  starterConfigYaml,
  type CliLocale,
  type FileEntry,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  missingApiKeyMessage,
  readApiKeyFromEnv,
  serveHttp,
  serveStdio,
} from "@hoanghainh/knot-sync-mcp-server";
import { textHasPii } from "@hoanghainh/knot-sync-pii-basic";
import { Store, type SourceStats } from "@hoanghainh/knot-sync-store-sqlite";
import {
  DEFAULT_UI_PORT,
  createUiServer,
} from "@hoanghainh/knot-sync-ui";
import { BenchSuiteError } from "./bench/suite.js";
import { cmdBench } from "./bench/run.js";
import { CatalogError, cmdDescribe } from "./describe.js";
import { formatBytes, formatCount, table } from "./format.js";
import { resolveLocale, t } from "./i18n/index.js";
import { loadAppPlugins } from "./plugins.js";
import {
  assertReportPathOutsideSources,
  normalizeReportArgv,
  writeScanReportHtml,
} from "./report.js";
import {
  runInProcessSyncCycle,
  runScanPass,
  runSyncPass,
  startPeriodicSync,
} from "./sync-cycle.js";
import {
  appendSystemLogSafe,
  sanitizeSystemLogError,
  withSystemLog,
} from "./system-log-run.js";
import type { MessageKey } from "./i18n/messages.js";

const PII_SAMPLE_EXTS = new Set([".txt", ".md", ".csv", ".tsv"]);
const PII_SAMPLE_MAX_BYTES = 256 * 1024;

/** Keep in sync with packages/cli/package.json (bundled into dist/bin.js at publish). */
export const VERSION = createRequire(import.meta.url)("../package.json").version as string;

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Show live progress (only when stderr is a terminal). */
  progress: boolean;
  /** Optional abort signal to trigger graceful server shutdown (used in tests/embedding). */
  signal?: AbortSignal;
}

const defaultIo: Io = {
  out: (t) => process.stdout.write(t + "\n"),
  err: (t) => process.stderr.write(t + "\n"),
  progress: Boolean(process.stderr.isTTY),
};

function helpText(locale: CliLocale): string {
  return t(locale, "help", { version: VERSION, configFile: DEFAULT_CONFIG_FILE });
}

function peekLangFlag(argv: string[]): string | undefined {
  const i = argv.indexOf("--lang");
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("-")) return argv[i + 1];
  return undefined;
}

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  let earlyLocale: CliLocale = "en";
  try {
    earlyLocale = resolveLocale({ flag: peekLangFlag(argv), env: process.env });
  } catch (err) {
    io.err(t("en", "error.prefix", { message: (err as Error).message }));
    return 2;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: normalizeReportArgv(argv),
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        lang: { type: "string" },
        path: { type: "string" },
        force: { type: "boolean" },
        json: { type: "boolean" },
        pii: { type: "boolean" },
        report: { type: "string" },
        port: { type: "string" },
        host: { type: "string" },
        http: { type: "boolean" },
        "sync-interval": { type: "string" },
        suite: { type: "string" },
      },
    });
  } catch (err) {
    io.err(t(earlyLocale, "error.prefix", { message: (err as Error).message }) + "\n");
    io.err(helpText(earlyLocale));
    return 2;
  }
  const { values, positionals } = parsed;
  const command = positionals[0];

  let locale = earlyLocale;
  try {
    locale = resolveLocale({ flag: values.lang, env: process.env });
  } catch (err) {
    io.err(t("en", "error.prefix", { message: (err as Error).message }));
    return 2;
  }

  if (values.version) {
    io.out(VERSION);
    return 0;
  }
  if (values.help || !command) {
    io.out(helpText(locale));
    return command || values.help ? 0 : 2;
  }

  const configPath = resolve(values.config ?? DEFAULT_CONFIG_FILE);
  const langFlag = values.lang;
  /** Updated when a command loads config so catch uses cli.locale. */
  let activeLocale = locale;

  try {
    switch (command) {
      case "init":
        return await cmdInit(configPath, values.path, Boolean(values.force), io, locale);
      case "scan":
        return await cmdScan(
          configPath,
          Boolean(values.json),
          typeof values.report === "string" ? values.report : undefined,
          Boolean(values.pii),
          io,
          langFlag,
          (l) => {
            activeLocale = l;
          },
        );
      case "run":
        return await cmdRun(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "describe":
        return await cmdDescribeEntry(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "ui":
        return await cmdUi(configPath, values.port, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "bench":
        return await cmdBenchEntry(
          configPath,
          Boolean(values.json),
          typeof values.suite === "string" ? values.suite : undefined,
          io,
          langFlag,
          (l) => {
            activeLocale = l;
          },
        );
      case "optimize":
        return await cmdOptimize(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "embed":
        return await cmdEmbed(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "plugins":
        return await cmdPlugins(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "serve":
        return await cmdServe(
          configPath,
          {
            http: Boolean(values.http),
            port: values.port,
            host: values.host,
            syncInterval: values["sync-interval"],
          },
          io,
          langFlag,
          (l) => {
            activeLocale = l;
          },
        );
      default:
        io.err(t(locale, "error.unknownCommand", { command }) + "\n");
        io.err(helpText(locale));
        return 2;
    }
  } catch (err) {
    if (
      err instanceof ConfigError ||
      (err instanceof Error && err.name === "ConfigError")
    ) {
      io.err(
        t(activeLocale, "error.configPrefix", {
          message: formatLoggingConfigError(activeLocale, err.message),
        }),
      );
      return 1;
    }
    if (err instanceof CatalogError) {
      io.err(t(activeLocale, "error.catalogPrefix", { message: err.message }));
      return 1;
    }
    if (err instanceof BenchSuiteError) {
      io.err(t(activeLocale, "error.prefix", { message: err.message }));
      return 1;
    }
    io.err(t(activeLocale, "error.prefix", { message: (err as Error).message }));
    return 1;
  }
}

function localeForConfig(
  langFlag: string | undefined,
  configLocale: CliLocale | undefined,
): CliLocale {
  return resolveLocale({ flag: langFlag, configLocale, env: process.env });
}

/** Localize known logging.* ConfigError messages; pass others through. */
function formatLoggingConfigError(locale: CliLocale, message: string): string {
  const unknown = /^Unknown key "([^"]+)" under "logging"/.exec(message);
  if (unknown) return t(locale, "logging.unknownKey", { key: unknown[1]! });
  if (message.includes('"logging.level" must be one of')) {
    const got = /\(got (.+)\)\.?$/.exec(message);
    return t(locale, "logging.invalidLevel", { value: got?.[1] ?? "?" });
  }
  if (message.includes('"logging.path" must be a non-empty')) {
    return t(locale, "logging.emptyPath");
  }
  const inside = /^Refusing to write system log inside source path "([^"]+)"/.exec(message);
  if (inside) return t(locale, "logging.pathInsideSource", { src: inside[1]! });
  return message;
}

function formatSystemLogWriteFailed(locale: CliLocale): (detail: string) => string {
  return (detail) => t(locale, "logging.writeFailed", { detail });
}

/** Localize OCR/housen LICENSE and DOCKER issue lines; other codes keep extractor message. */
function formatRunIssue(
  locale: CliLocale,
  issue: { path: string; code: string; message: string },
): string {
  if (issue.code === "LICENSE") {
    const key: MessageKey = /housen|HOUSEN|KNOT_SYNC_HOUSEN/i.test(issue.message)
      ? "run.issueHousenLicense"
      : "run.issueLicense";
    return `  [${issue.code}] ${issue.path}: ${t(locale, key)}`;
  }
  if (issue.code === "DOCKER") {
    return `  [DOCKER] ${issue.path}: ${t(locale, "run.issueDocker")}`;
  }
  return `  [${issue.code}] ${issue.path}: ${issue.message}`;
}

async function cmdDescribeEntry(
  configPath: string,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host);
  return cmdDescribe(structural, config, io, { locale });
}

async function cmdBenchEntry(
  configPath: string,
  json: boolean,
  suitePath: string | undefined,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  return cmdBench(
    {
      configPath,
      storePath: structural.store.path,
      catalogPath: structural.catalog.path,
      suitePathFlag: suitePath ? resolve(suitePath) : undefined,
      json,
      locale,
    },
    io,
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function cmdInit(
  configPath: string,
  folder: string | undefined,
  force: boolean,
  io: Io,
  locale: CliLocale,
): Promise<number> {
  if ((await exists(configPath)) && !force) {
    io.err(t(locale, "init.exists", { path: configPath }));
    return 1;
  }
  await writeFile(configPath, starterConfigYaml(folder ?? "./data-to-scan"), "utf8");
  io.out(t(locale, "init.created", { path: configPath }));
  io.out(t(locale, "init.next"));
  return 0;
}

interface ScanResult {
  stats: SourceStats;
  issues: ScanIssue[];
  topDuplicates: { size: number; paths: string[] }[];
  /** Present only when scan --pii was used. */
  piiLikelyFiles?: number;
}

async function estimatePiiLikelyFiles(
  files: FileEntry[],
  host: Awaited<ReturnType<typeof loadAppPlugins>>,
): Promise<number> {
  let count = 0;
  const rules = host.piiRules.values();
  const ruleList = [...rules];
  for (const file of files) {
    if (!PII_SAMPLE_EXTS.has(file.ext) || file.size <= 0 || file.size > PII_SAMPLE_MAX_BYTES) {
      continue;
    }
    try {
      const buf = await readFile(file.absPath);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      if (textHasPii(text, ruleList)) count += 1;
    } catch {
      // Skip unreadable / non-UTF-8; do not print contents.
    }
  }
  return count;
}

async function cmdScan(
  configPath: string,
  json: boolean,
  reportPath: string | undefined,
  piiEstimate: boolean,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host);
  return withSystemLog(
    {
      command: "scan",
      logging: config.logging,
      sourcePaths: sourceRootPaths(config.sources),
      io,
      formatWriteFailed: formatSystemLogWriteFailed(locale),
    },
    async () => {
      const store = new Store(config.store.path);
      const results: ScanResult[] = [];

      try {
        let lastShown = 0;
        const scanRes = await runScanPass({
          config,
          host,
          store,
          onSourceProgress: (sourceId, count) => {
            if (io.progress && count - lastShown >= 200) {
              lastShown = count;
              process.stderr.write(
                "\r" +
                  t(locale, "scan.progressFiles", {
                    sourceId,
                    count: formatCount(count),
                  }),
              );
            }
          },
          onSourceDone: () => {
            if (io.progress && lastShown > 0) process.stderr.write("\r\x1b[K");
            lastShown = 0;
          },
        });
        for (const s of scanRes.sources) {
          const row: ScanResult = {
            stats: s.stats,
            issues: s.issues,
            topDuplicates: s.topDuplicates,
          };
          if (piiEstimate) {
            row.piiLikelyFiles = await estimatePiiLikelyFiles(s.files, host);
          }
          results.push(row);
        }
      } finally {
        store.close();
      }

      if (json) {
        io.out(
          JSON.stringify({ version: VERSION, store: config.store.path, sources: results }, null, 2),
        );
      } else {
        for (const r of results) printStats(r, config.scan.oldFileYears, io, locale);
        io.out(t(locale, "scan.inventorySaved", { path: config.store.path }));
        io.out(t(locale, "scan.next"));
      }
      if (reportPath !== undefined) {
        const abs = assertReportPathOutsideSources(
          reportPath,
          sourceRootPaths(config.sources),
        );
        const written = await writeScanReportHtml(abs, {
          version: VERSION,
          storePath: config.store.path,
          generatedAt: new Date().toISOString(),
          oldFileYears: config.scan.oldFileYears,
          sources: results.map((r) => ({
            stats: r.stats,
            issues: r.issues.map((i) => ({
              path: i.path,
              code: i.code,
              message: i.message,
            })),
            topDuplicates: r.topDuplicates.map((g) => ({
              size: g.size,
              paths: g.paths,
            })),
            ...(r.piiLikelyFiles !== undefined ? { piiLikelyFiles: r.piiLikelyFiles } : {}),
          })),
        });
        io.out(t(locale, "scan.htmlReport", { path: written }));
      }
      return 0;
    },
  );
}

async function cmdRun(
  configPath: string,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host); // validate sources even though run uses inventory
  return withSystemLog(
    {
      command: "run",
      logging: config.logging,
      sourcePaths: sourceRootPaths(config.sources),
      io,
      formatWriteFailed: formatSystemLogWriteFailed(locale),
    },
    async (log) => {
  const store = new Store(structural.store.path);

  try {
    const syncRes = await runSyncPass({ config, host, store });
    if (syncRes.noInventory) {
      io.err(t(locale, "run.noInventory", { path: structural.store.path }));
      return 1;
    }

    if (syncRes.pruned > 0) {
      await appendSystemLogSafe(
        log,
        io,
        {
          level: "info",
          event: "run.prune",
          command: "run",
          count: syncRes.pruned,
          storePath: structural.store.path,
        },
        formatSystemLogWriteFailed(locale),
      );
    }

    io.out(
      t(locale, "run.complete", {
        extracted: formatCount(syncRes.extracted),
        skipped: formatCount(syncRes.skipped),
        pruned: formatCount(syncRes.pruned),
        failed: formatCount(syncRes.failed),
      }),
    );
    if (syncRes.issues.length > 0) {
      io.out(t(locale, "run.issuesHeader"));
      for (const i of syncRes.issues.slice(0, 20)) {
        io.out(formatRunIssue(locale, i));
      }
      if (syncRes.issues.length > 20) {
        io.out(t(locale, "run.andMoreIssues", { n: syncRes.issues.length - 20 }));
      }
    }
    io.out(t(locale, "run.documentsSaved", { path: structural.store.path }));

    if (syncRes.embed) {
      if (syncRes.embed.error !== undefined) {
        io.err(
          t(locale, "embed.failed", {
            detail: syncRes.embed.error,
          }),
        );
      } else if (!syncRes.embed.skippedBySetting) {
        io.out(
          t(locale, "embed.done", {
            written: String(syncRes.embed.written),
            skipped: String(syncRes.embed.skipped),
            failed: String(syncRes.embed.failed),
          }),
        );
      }
    }

    io.out(t(locale, "run.next"));
    return 0;
  } finally {
    store.close();
  }
    },
  );
}

async function cmdEmbed(
  configPath: string,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host);
  const embedTool = host.mcpTools.get("embed_documents");
  if (!embedTool) {
    io.err(t(locale, "embed.pluginMissing"));
    return 2;
  }
  const store = new Store(structural.store.path);
  try {
    const result = await embedTool.handler({}, { store, config });
    io.out(
      t(locale, "embed.done", {
        written: String(result.meta?.written ?? 0),
        skipped: String(result.meta?.skipped ?? 0),
        failed: String(result.meta?.failed ?? 0),
      }),
    );
    return 0;
  } catch (err) {
    io.err(
      t(locale, "embed.failed", {
        detail: (err as Error).message || String(err),
      }),
    );
    return 1;
  } finally {
    store.close();
  }
}

async function cmdUi(
  configPath: string,
  portRaw: string | undefined,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  let port = DEFAULT_UI_PORT;
  if (portRaw !== undefined) {
    const n = Number(portRaw);
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
      throw new ConfigError(
        `"--port" must be an integer 0–65535 (0 = ephemeral; got ${JSON.stringify(portRaw)}).`,
      );
    }
    port = n;
  }
  const catalogPath = structural.catalog.path;
  const ui = await createUiServer({
    catalogPath,
    storePath: structural.store.path,
    port,
  });
  const pageUrl = `${ui.url}?lang=${locale}`;
  io.err(t(locale, "ui.listening", { url: pageUrl }));
  io.err(t(locale, "ui.openHint", { path: catalogPath }));

  // Smoke tests can set KNOT_SYNC_UI_SMOKE=1 to exit after bind.
  if (process.env.KNOT_SYNC_UI_SMOKE === "1") {
    await ui.close();
    return 0;
  }

  await new Promise<void>((resolve) => {
    const stop = () => {
      void ui.close().finally(() => resolve());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  return 0;
}

async function cmdOptimize(
  configPath: string,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host);
  return withSystemLog(
    {
      command: "optimize",
      logging: config.logging,
      sourcePaths: sourceRootPaths(config.sources),
      io,
      formatWriteFailed: formatSystemLogWriteFailed(locale),
    },
    async () => {
      let store: Store;
      try {
        store = new Store(structural.store.path);
      } catch (err) {
        io.err(
          t(locale, "optimize.storeOpenFailed", {
            path: structural.store.path,
            detail: (err as Error).message || String(err),
          }),
        );
        return 1;
      }
      try {
        store.optimize();
        io.out(t(locale, "optimize.done", { path: structural.store.path }));
        return 0;
      } finally {
        store.close();
      }
    },
  );
}

async function cmdPlugins(
  configPath: string,
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const host = await loadAppPlugins(structural);
  io.out(t(locale, "plugins.header"));
  if (host.loaded.length === 0) {
    io.out(t(locale, "plugins.none"));
    return 0;
  }
  for (const plugin of host.loaded) {
    const ext =
      plugin.extensions.length === 0
        ? t(locale, "plugins.noExtensions")
        : plugin.extensions.map((e) => `${e.point}:${e.id}`).join(", ");
    io.out(`  ${plugin.name}@${plugin.version}`);
    io.out(`    ${ext}`);
  }
  return 0;
}

/**
 * Start the MCP server on stdio. Human diagnostics go to stderr only —
 * stdout belongs to the MCP JSON-RPC transport.
 */
async function loadCatalogIfPresent(path: string) {
  try {
    await access(path);
  } catch {
    return undefined;
  }
  return loadCatalogFile(path);
}

function resolveSyncIntervalSeconds(
  flagValue: string | undefined,
  configured: number | undefined,
  locale: CliLocale,
): number | undefined {
  if (flagValue === undefined) return configured;
  const trimmed = flagValue.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(
      t(locale, "serve.invalidSyncInterval", { value: String(flagValue) }),
    );
  }
  return parsed;
}

async function cmdServe(
  configPath: string,
  flags: { http: boolean; port?: string; host?: string; syncInterval?: string },
  io: Io,
  langFlag: string | undefined,
  onLocale: (locale: CliLocale) => void,
): Promise<number> {
  const structural = await loadConfig(configPath);
  const locale = localeForConfig(langFlag, structural.cli.locale);
  onLocale(locale);
  const syncIntervalSeconds = resolveSyncIntervalSeconds(
    flags.syncInterval,
    structural.server.syncIntervalSeconds,
    locale,
  );
  const pluginHost = await loadAppPlugins(structural);
  const config = resolveConfig(structural, pluginHost);
  const writeFailed = formatSystemLogWriteFailed(locale);
  return withSystemLog(
    {
      command: "serve",
      logging: config.logging,
      sourcePaths: sourceRootPaths(config.sources),
      io,
      formatWriteFailed: writeFailed,
    },
    async (log) => {
      const catalog = await loadCatalogIfPresent(config.catalog.path);
      const store = new Store(config.store.path);

      try {
        let port = DEFAULT_HTTP_PORT;
        let bindHost = DEFAULT_HTTP_HOST;
        if (flags.http) {
          if (!readApiKeyFromEnv() && !pluginHost.mcpAuthProvider) {
            throw new ConfigError(missingApiKeyMessage());
          }
          if (flags.port !== undefined) {
            const n = Number(flags.port);
            if (!Number.isInteger(n) || n <= 0 || n > 65535) {
              throw new ConfigError(
                t(locale, "serve.invalidPort", { value: String(flags.port) }),
              );
            }
            port = n;
          }
          bindHost = flags.host?.trim() || DEFAULT_HTTP_HOST;
        }

        const catalogSuffix = catalog
          ? t(locale, "serve.catalogSuffix", { path: config.catalog.path })
          : "";
        const syncSuffix =
          syncIntervalSeconds !== undefined
            ? t(locale, "serve.syncSuffix", { seconds: String(syncIntervalSeconds) })
            : "";
        let listenLogPromise: Promise<void> | undefined;

        if (!flags.http) {
          io.err(
            t(locale, "serve.listening", {
              store: config.store.path,
              audit: config.server.auditLog,
            }) +
              catalogSuffix +
              syncSuffix,
          );
          await appendSystemLogSafe(
            log,
            io,
            {
              level: "info",
              event: "serve.listen",
              command: "serve",
              storePath: config.store.path,
            },
            writeFailed,
          );
        }

        const periodic =
          syncIntervalSeconds !== undefined
            ? startPeriodicSync({
                intervalSeconds: syncIntervalSeconds,
                runCycle: (signal) =>
                  runInProcessSyncCycle({
                    config,
                    host: pluginHost,
                    store,
                    signal,
                  }),
                onCycleStart: async () => {
                  await appendSystemLogSafe(
                    log,
                    io,
                    {
                      level: "info",
                      event: "sync.start",
                      command: "serve",
                      storePath: config.store.path,
                    },
                    writeFailed,
                  );
                },
                onCycleEnd: async (summary) => {
                  await appendSystemLogSafe(
                    log,
                    io,
                    {
                      level: summary.failed > 0 || summary.embedError ? "warn" : "info",
                      event: "sync.end",
                      command: "serve",
                      durationMs: summary.durationMs,
                      scanned: summary.scanned,
                      extracted: summary.extracted,
                      skipped: summary.skipped,
                      pruned: summary.pruned,
                      failed: summary.failed,
                      storePath: config.store.path,
                      ...(summary.embedError !== undefined
                        ? { error: sanitizeSystemLogError(summary.embedError) }
                        : {}),
                    },
                    writeFailed,
                  );
                },
                onCycleError: async (err, durationMs) => {
                  await appendSystemLogSafe(
                    log,
                    io,
                    {
                      level: "error",
                      event: "sync.error",
                      command: "serve",
                      durationMs,
                      error: sanitizeSystemLogError(err),
                      storePath: config.store.path,
                    },
                    writeFailed,
                  );
                },
              })
            : undefined;

        try {
          if (flags.http) {
            await serveHttp({
              store,
              config,
              host: pluginHost,
              catalog,
              bindHost,
              port,
              ...(io.signal ? { signal: io.signal } : {}),
              onListening: ({ host: boundHost, port: boundPort }) => {
                io.err(
                  t(locale, "serve.listeningHttp", {
                    host: boundHost,
                    port: String(boundPort),
                    store: config.store.path,
                    audit: config.server.auditLog,
                  }) +
                    catalogSuffix +
                    syncSuffix,
                );
                listenLogPromise = appendSystemLogSafe(
                  log,
                  io,
                  {
                    level: "info",
                    event: "serve.listen",
                    command: "serve",
                    host: boundHost,
                    port: boundPort,
                    storePath: config.store.path,
                  },
                  writeFailed,
                );
              },
            });
          } else {
            await serveStdio({
              store,
              config,
              host: pluginHost,
              catalog,
              ...(io.signal ? { signal: io.signal } : {}),
            });
          }
        } finally {
          await listenLogPromise;
          await periodic?.stop();
          await appendSystemLogSafe(
            log,
            io,
            {
              level: "info",
              event: "serve.shutdown",
              command: "serve",
              storePath: config.store.path,
            },
            writeFailed,
          );
        }
      } finally {
        store.close();
      }
      return 0;
    },
  );
}

function printStats(r: ScanResult, oldYears: number, io: Io, locale: CliLocale): void {
  const s = r.stats;
  io.out(
    t(locale, "scan.sourceHeader", {
      sourceId: s.sourceId,
      files: formatCount(s.fileCount),
      bytes: formatBytes(s.totalBytes),
    }),
  );

  if (s.byType.length > 0) {
    io.out(t(locale, "scan.byType"));
    io.out(
      table(
        s.byType.map((row) => [row.type, formatCount(row.count), formatBytes(row.bytes)]),
        "    ",
      ),
    );
  }

  io.out(t(locale, "scan.health"));
  const healthRows: string[][] = [
    [
      t(locale, "scan.dupCopies"),
      formatCount(s.duplicateFiles),
      t(locale, "scan.wasted", { bytes: formatBytes(s.duplicateBytes) }),
    ],
    [t(locale, "scan.olderThan", { years: oldYears }), formatCount(s.oldFiles), ""],
    [t(locale, "scan.emptyFiles"), formatCount(s.emptyFiles), ""],
    [t(locale, "scan.unreadable"), formatCount(s.issues), ""],
  ];
  if (r.piiLikelyFiles !== undefined) {
    healthRows.push([t(locale, "scan.likelyPii"), formatCount(r.piiLikelyFiles), ""]);
  }
  io.out(table(healthRows, "    "));

  if (r.topDuplicates.length > 0) {
    io.out(t(locale, "scan.biggestDupes"));
    for (const g of r.topDuplicates) {
      io.out(`    ${formatBytes(g.size)} × ${g.paths.length}`);
      for (const p of g.paths.slice(0, 4)) io.out(`      - ${p}`);
      if (g.paths.length > 4) {
        io.out(t(locale, "scan.andMorePaths", { n: g.paths.length - 4 }));
      }
    }
  }

  if (r.issues.length > 0) {
    io.out(t(locale, "scan.couldNotRead"));
    for (const i of r.issues.slice(0, 5)) io.out(`    [${i.code}] ${i.path}`);
    if (r.issues.length > 5) {
      io.out(t(locale, "scan.andMoreIssues", { n: r.issues.length - 5 }));
    }
  }
  io.out("");
}
