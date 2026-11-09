import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadCatalogFile } from "@hoanghainh/knot-sync-catalog";
import {
  ConfigError,
  DEFAULT_CONFIG_FILE,
  loadConfig,
  resolveConfig,
  starterConfigYaml,
  type CliLocale,
  type FileEntry,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";
import { applyGuardToDocument } from "@hoanghainh/knot-sync-guard";
import { serveStdio } from "@hoanghainh/knot-sync-mcp-server";
import { applyPiiToDocument, textHasPii } from "@hoanghainh/knot-sync-pii-basic";
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
import { findExtractor, loadAppPlugins } from "./plugins.js";
import {
  assertReportPathOutsideSources,
  normalizeReportArgv,
  writeScanReportHtml,
} from "./report.js";

const PII_SAMPLE_EXTS = new Set([".txt", ".md", ".csv", ".tsv"]);
const PII_SAMPLE_MAX_BYTES = 256 * 1024;

export const VERSION = "0.1.1";

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Show live progress (only when stderr is a terminal). */
  progress: boolean;
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
      case "plugins":
        return await cmdPlugins(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      case "serve":
        return await cmdServe(configPath, io, langFlag, (l) => {
          activeLocale = l;
        });
      default:
        io.err(t(locale, "error.unknownCommand", { command }) + "\n");
        io.err(helpText(locale));
        return 2;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      io.err(t(activeLocale, "error.configPrefix", { message: err.message }));
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
  const store = new Store(config.store.path);
  const results: ScanResult[] = [];

  try {
    for (const source of config.sources) {
      const connector = host.getConnector(source.type);
      if (!connector) {
        throw new ConfigError(
          `No connector registered for source type "${source.type}". ` +
            `Registered: ${host.listConnectorIds().join(", ") || "(none)"}.`,
        );
      }

      const files: FileEntry[] = [];
      const issues: ScanIssue[] = [];
      let lastShown = 0;

      for await (const entry of connector.scan(source, {
        hash: config.scan.hash,
        onIssue: (i) => issues.push(i),
      })) {
        files.push(entry);
        if (io.progress && files.length - lastShown >= 200) {
          lastShown = files.length;
          process.stderr.write(
            "\r" +
              t(locale, "scan.progressFiles", {
                sourceId: source.id,
                count: formatCount(files.length),
              }),
          );
        }
      }
      if (io.progress && lastShown > 0) process.stderr.write("\r\x1b[K");

      store.replaceScan(source.id, files, issues);
      const row: ScanResult = {
        stats: store.stats(source.id, config.scan.oldFileYears),
        issues,
        topDuplicates: store.duplicateGroups(source.id, 5),
      };
      if (piiEstimate) {
        row.piiLikelyFiles = await estimatePiiLikelyFiles(files, host);
      }
      results.push(row);
    }
  } finally {
    store.close();
  }

  if (json) {
    io.out(JSON.stringify({ version: VERSION, store: config.store.path, sources: results }, null, 2));
  } else {
    for (const r of results) printStats(r, config.scan.oldFileYears, io, locale);
    io.out(t(locale, "scan.inventorySaved", { path: config.store.path }));
  }
  if (reportPath !== undefined) {
    const abs = assertReportPathOutsideSources(
      reportPath,
      config.sources.map((s) => ("path" in s ? String(s.path) : "")).filter(Boolean),
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
  resolveConfig(structural, host); // validate sources even though run uses inventory
  const store = new Store(structural.store.path);

  try {
    const files = store.listFiles();
    if (files.length === 0) {
      io.err(t(locale, "run.noInventory", { path: structural.store.path }));
      return 1;
    }

    let extracted = 0;
    let skipped = 0;
    let failed = 0;
    const issues: { path: string; code: string; message: string }[] = [];

    for (const file of files) {
      const extractor = findExtractor(host, file);
      if (!extractor) {
        failed += 1;
        issues.push({
          path: file.relPath,
          code: "UNSUPPORTED",
          message: `No extractor registered for ${file.ext || "(no extension)"}.`,
        });
        continue;
      }

      if (store.isUnchangedExtraction(file)) {
        skipped += 1;
        continue;
      }

      try {
        const result = await extractor.extract(file);
        if (!result.ok) {
          failed += 1;
          issues.push({ path: file.relPath, code: result.code, message: result.message });
          continue;
        }

        let document = result.document;
        let currentCleanerId = "(unknown)";
        try {
          for (const cleaner of host.cleaners.values()) {
            currentCleanerId = cleaner.id;
            document = await cleaner.clean(document);
          }
        } catch (err) {
          const message =
            `Cleaner "${currentCleanerId}" failed (${(err as Error).message || String(err)}). ` +
            `Disable steps under cleaning: or fix the input, then retry "knot-sync run".`;
          const {
            sourceFileHash: _drop,
            originalContent: _oc,
            originalTables: _ot,
            guardHiddenText: _ht,
            ...restMeta
          } = result.document.metadata;
          void _drop;
          void _oc;
          void _ot;
          void _ht;
          // Never persist unmasked PII on error — omit originals when rules are active.
          store.upsertDocument({
            ...result.document,
            content: "",
            tables: [],
            pii: [],
            guard: [],
            metadata: {
              ...restMeta,
              status: "error",
              errorMessage: message,
              ...(host.piiRules.size === 0
                ? {
                    originalContent:
                      result.document.metadata.originalContent ??
                      result.document.content,
                  }
                : {}),
            },
          });
          failed += 1;
          issues.push({ path: file.relPath, code: "CLEAN", message });
          continue;
        }

        try {
          if (host.piiRules.size > 0) {
            document = applyPiiToDocument(document, host.piiRules.values(), structural.pii);
          }
        } catch (err) {
          const message =
            `PII masking failed (${(err as Error).message || String(err)}). ` +
            `Check pii: settings or disable rules, then retry "knot-sync run".`;
          const {
            sourceFileHash: _drop,
            originalContent: _oc,
            originalTables: _ot,
            guardHiddenText: _ht,
            ...restMeta
          } = document.metadata;
          void _drop;
          void _oc;
          void _ot;
          void _ht;
          store.upsertDocument({
            ...document,
            content: "",
            tables: [],
            pii: [],
            guard: [],
            metadata: {
              ...restMeta,
              status: "error",
              errorMessage: message,
            },
          });
          failed += 1;
          issues.push({ path: file.relPath, code: "PII", message });
          continue;
        }

        try {
          if (host.guardRules.size > 0) {
            document = applyGuardToDocument(
              document,
              host.guardRules.values(),
              structural.guard,
            );
            if (document.metadata.status === "error") {
              store.upsertDocument(document);
              failed += 1;
              issues.push({
                path: file.relPath,
                code: "GUARD",
                message: String(document.metadata.errorMessage ?? "blocked by guard"),
              });
              continue;
            }
          }
          store.upsertDocument(document);
          extracted += 1;
        } catch (err) {
          const message =
            `Prompt-injection guard failed (${(err as Error).message || String(err)}). ` +
            `Check guard: settings or disable rules, then retry "knot-sync run".`;
          const {
            sourceFileHash: _drop,
            originalContent: _oc,
            originalTables: _ot,
            guardHiddenText: _ht,
            ...restMeta
          } = document.metadata;
          void _drop;
          void _oc;
          void _ot;
          void _ht;
          store.upsertDocument({
            ...document,
            content: "",
            tables: [],
            pii: document.pii,
            guard: document.guard ?? [],
            metadata: {
              ...restMeta,
              status: "error",
              errorMessage: message,
            },
          });
          failed += 1;
          issues.push({ path: file.relPath, code: "GUARD", message });
        }
      } catch (err) {
        failed += 1;
        issues.push({
          path: file.relPath,
          code: "EXTRACT",
          message: (err as Error).message || String(err),
        });
      }
    }

    io.out(
      t(locale, "run.complete", {
        extracted: formatCount(extracted),
        skipped: formatCount(skipped),
        failed: formatCount(failed),
      }),
    );
    if (issues.length > 0) {
      io.out(t(locale, "run.issuesHeader"));
      for (const i of issues.slice(0, 20)) {
        io.out(`  [${i.code}] ${i.path}: ${i.message}`);
      }
      if (issues.length > 20) {
        io.out(t(locale, "run.andMoreIssues", { n: issues.length - 20 }));
      }
    }
    io.out(t(locale, "run.documentsSaved", { path: structural.store.path }));
    return 0;
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
  const ui = await createUiServer({ catalogPath, port });
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

async function cmdServe(
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
  const catalog = await loadCatalogIfPresent(config.catalog.path);
  const store = new Store(config.store.path);
  io.err(
    t(locale, "serve.listening", { store: config.store.path, audit: config.server.auditLog }) +
      (catalog ? t(locale, "serve.catalogSuffix", { path: config.catalog.path }) : ""),
  );
  try {
    await serveStdio({ store, config, host, catalog });
  } finally {
    store.close();
  }
  return 0;
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
