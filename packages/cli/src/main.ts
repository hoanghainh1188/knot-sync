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
  type FileEntry,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";
import { applyGuardToDocument } from "@hoanghainh/knot-sync-guard";
import { serveStdio } from "@hoanghainh/knot-sync-mcp-server";
import { applyPiiToDocument, textHasPii } from "@hoanghainh/knot-sync-pii-basic";
import { Store, type SourceStats } from "@hoanghainh/knot-sync-store-sqlite";
import { CatalogError, cmdDescribe } from "./describe.js";
import { formatBytes, formatCount, table } from "./format.js";
import { findExtractor, loadAppPlugins } from "./plugins.js";
import {
  assertReportPathOutsideSources,
  normalizeReportArgv,
  writeScanReportHtml,
} from "./report.js";

const PII_SAMPLE_EXTS = new Set([".txt", ".md", ".csv", ".tsv"]);
const PII_SAMPLE_MAX_BYTES = 256 * 1024;

export const VERSION = "0.1.0";

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

const HELP = `KnotSync (knot-sync) ${VERSION}
Scan, clean and serve legacy enterprise data to AI agents via MCP.
Everything runs on this machine. Sources are only read, never changed.

Usage:
  knot-sync <command> [options]

Commands:
  init      Create a config file in the current folder
  scan      Inventory all sources: file types, sizes, duplicates, old files
  run       Extract text/tables from the last scan into the document store
  describe  Generate/update knot-sync.catalog.yaml for SQL sources
  plugins   List loaded plugins and their extension points
  serve     Start the MCP server (stdio only; for Claude Desktop / Cursor / Claude Code)

Options:
  -c, --config <file>   Config file (default: ${DEFAULT_CONFIG_FILE})
  -h, --help            Show help
  -v, --version         Show version

init options:
  --path <folder>       Folder to scan (written into the config)
  --force               Overwrite an existing config file

scan options:
  --json                Print results as JSON
  --pii                 Estimate how many text files look like they contain PII
  --report [file]       Write a self-contained HTML report (default: ./knot-sync-scan-report.html)

plugins:
  Plugins run in-process with full trust. Install only plugins you trust.
  Paid plugins check their own license keys; the core never does.
`;

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: normalizeReportArgv(argv),
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        path: { type: "string" },
        force: { type: "boolean" },
        json: { type: "boolean" },
        pii: { type: "boolean" },
        report: { type: "string" },
      },
    });
  } catch (err) {
    io.err(`Error: ${(err as Error).message}\n`);
    io.err(HELP);
    return 2;
  }
  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.version) {
    io.out(VERSION);
    return 0;
  }
  if (values.help || !command) {
    io.out(HELP);
    return command || values.help ? 0 : 2;
  }

  const configPath = resolve(values.config ?? DEFAULT_CONFIG_FILE);

  try {
    switch (command) {
      case "init":
        return await cmdInit(configPath, values.path, Boolean(values.force), io);
      case "scan":
        return await cmdScan(
          configPath,
          Boolean(values.json),
          typeof values.report === "string" ? values.report : undefined,
          Boolean(values.pii),
          io,
        );
      case "run":
        return await cmdRun(configPath, io);
      case "describe":
        return await cmdDescribeEntry(configPath, io);
      case "plugins":
        return await cmdPlugins(configPath, io);
      case "serve":
        return await cmdServe(configPath, io);
      default:
        io.err(`Unknown command "${command}".\n`);
        io.err(HELP);
        return 2;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      io.err(`Config error: ${err.message}`);
      return 1;
    }
    if (err instanceof CatalogError) {
      io.err(`Catalog error: ${err.message}`);
      return 1;
    }
    io.err(`Error: ${(err as Error).message}`);
    return 1;
  }
}

async function cmdDescribeEntry(configPath: string, io: Io): Promise<number> {
  const structural = await loadConfig(configPath);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host);
  return cmdDescribe(structural, config, io);
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
): Promise<number> {
  if ((await exists(configPath)) && !force) {
    io.err(`${configPath} already exists. Use --force to overwrite.`);
    return 1;
  }
  await writeFile(configPath, starterConfigYaml(folder ?? "./data-to-scan"), "utf8");
  io.out(`Created ${configPath}`);
  io.out(`Next: edit "sources", then run: knot-sync scan`);
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
): Promise<number> {
  const structural = await loadConfig(configPath);
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
          process.stderr.write(`\r  [${source.id}] ${formatCount(files.length)} files…`);
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
    for (const r of results) printStats(r, config.scan.oldFileYears, io);
    io.out(`Inventory saved to ${config.store.path}`);
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
    io.out(`HTML report written to ${written}`);
  }
  return 0;
}

async function cmdRun(configPath: string, io: Io): Promise<number> {
  const structural = await loadConfig(configPath);
  const host = await loadAppPlugins(structural);
  resolveConfig(structural, host); // validate sources even though run uses inventory
  const store = new Store(structural.store.path);

  try {
    const files = store.listFiles();
    if (files.length === 0) {
      io.err(
        `No scan inventory found in ${structural.store.path}.\n` +
          `Run "knot-sync scan" first, then "knot-sync run".`,
      );
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
      `Run complete: ${formatCount(extracted)} extracted, ${formatCount(skipped)} unchanged, ${formatCount(failed)} issues`,
    );
    if (issues.length > 0) {
      io.out("\nIssues:");
      for (const i of issues.slice(0, 20)) {
        io.out(`  [${i.code}] ${i.path}: ${i.message}`);
      }
      if (issues.length > 20) io.out(`  … and ${issues.length - 20} more`);
    }
    io.out(`Documents saved to ${structural.store.path}`);
    return 0;
  } finally {
    store.close();
  }
}

async function cmdPlugins(configPath: string, io: Io): Promise<number> {
  const structural = await loadConfig(configPath);
  const host = await loadAppPlugins(structural);

  io.out("Loaded plugins (in-process, full trust — install only plugins you trust):");
  if (host.loaded.length === 0) {
    io.out("  (none)");
    return 0;
  }
  for (const plugin of host.loaded) {
    const ext =
      plugin.extensions.length === 0
        ? "(no extensions)"
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

async function cmdServe(configPath: string, io: Io): Promise<number> {
  const structural = await loadConfig(configPath);
  const host = await loadAppPlugins(structural);
  const config = resolveConfig(structural, host);
  const catalog = await loadCatalogIfPresent(config.catalog.path);
  const store = new Store(config.store.path);
  io.err(
    `KnotSync MCP server on stdio. Store: ${config.store.path}. Audit: ${config.server.auditLog}.` +
      (catalog ? ` Catalog: ${config.catalog.path}.` : ""),
  );
  try {
    await serveStdio({ store, config, host, catalog });
  } finally {
    store.close();
  }
  return 0;
}

function printStats(r: ScanResult, oldYears: number, io: Io): void {
  const s = r.stats;
  io.out(`\n■ Source "${s.sourceId}": ${formatCount(s.fileCount)} files, ${formatBytes(s.totalBytes)}`);

  if (s.byType.length > 0) {
    io.out("\n  By type:");
    io.out(
      table(
        s.byType.map((t) => [t.type, formatCount(t.count), formatBytes(t.bytes)]),
        "    ",
      ),
    );
  }

  io.out("\n  Health:");
  const healthRows: string[][] = [
    ["Duplicate copies", formatCount(s.duplicateFiles), `${formatBytes(s.duplicateBytes)} wasted`],
    [`Older than ${oldYears} years`, formatCount(s.oldFiles), ""],
    ["Empty files", formatCount(s.emptyFiles), ""],
    ["Unreadable", formatCount(s.issues), ""],
  ];
  if (r.piiLikelyFiles !== undefined) {
    healthRows.push(["Likely PII (sample)", formatCount(r.piiLikelyFiles), ""]);
  }
  io.out(table(healthRows, "    "));

  if (r.topDuplicates.length > 0) {
    io.out("\n  Biggest duplicates:");
    for (const g of r.topDuplicates) {
      io.out(`    ${formatBytes(g.size)} × ${g.paths.length}`);
      for (const p of g.paths.slice(0, 4)) io.out(`      - ${p}`);
      if (g.paths.length > 4) io.out(`      … and ${g.paths.length - 4} more`);
    }
  }

  if (r.issues.length > 0) {
    io.out("\n  Could not read:");
    for (const i of r.issues.slice(0, 5)) io.out(`    [${i.code}] ${i.path}`);
    if (r.issues.length > 5) io.out(`    … and ${r.issues.length - 5} more`);
  }
  io.out("");
}
