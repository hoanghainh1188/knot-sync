import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  ConfigError,
  DEFAULT_CONFIG_FILE,
  loadConfig,
  resolveConfig,
  starterConfigYaml,
  type FileEntry,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";
import { Store, type SourceStats } from "@hoanghainh/knot-sync-store-sqlite";
import { formatBytes, formatCount, table } from "./format.js";
import { findExtractor, loadAppPlugins } from "./plugins.js";

export const VERSION = "0.0.1";

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
  plugins   List loaded plugins and their extension points
  serve     (coming soon) Start the MCP server

Options:
  -c, --config <file>   Config file (default: ${DEFAULT_CONFIG_FILE})
  -h, --help            Show help
  -v, --version         Show version

init options:
  --path <folder>       Folder to scan (written into the config)
  --force               Overwrite an existing config file

scan options:
  --json                Print results as JSON
  --report              (coming soon) Also write an HTML report

plugins:
  Plugins run in-process with full trust. Install only plugins you trust.
  Paid plugins check their own license keys; the core never does.
`;

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: "string", short: "c" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        path: { type: "string" },
        force: { type: "boolean" },
        json: { type: "boolean" },
        report: { type: "boolean" },
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
        return await cmdScan(configPath, Boolean(values.json), Boolean(values.report), io);
      case "run":
        return await cmdRun(configPath, io);
      case "plugins":
        return await cmdPlugins(configPath, io);
      case "serve":
        io.err(`"serve" is not available yet. It is planned for a later v0.1 milestone.`);
        return 2;
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
    io.err(`Error: ${(err as Error).message}`);
    return 1;
  }
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
}

async function cmdScan(configPath: string, json: boolean, report: boolean, io: Io): Promise<number> {
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
      results.push({
        stats: store.stats(source.id, config.scan.oldFileYears),
        issues,
        topDuplicates: store.duplicateGroups(source.id, 5),
      });
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
  if (report) {
    io.err('Note: "--report" (HTML report) is not available yet. It is planned for week 6.');
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
          store.upsertDocument(document);
          extracted += 1;
        } catch (err) {
          const message =
            `Cleaner "${currentCleanerId}" failed (${(err as Error).message || String(err)}). ` +
            `Disable steps under cleaning: or fix the input, then retry "knot-sync run".`;
          // Drop sourceFileHash so the next run retries instead of treating this as unchanged.
          const { sourceFileHash: _drop, ...restMeta } = result.document.metadata;
          void _drop;
          store.upsertDocument({
            ...result.document,
            metadata: {
              ...restMeta,
              status: "error",
              errorMessage: message,
              originalContent:
                result.document.metadata.originalContent ?? result.document.content,
            },
          });
          failed += 1;
          issues.push({ path: file.relPath, code: "CLEAN", message });
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
  io.out(
    table(
      [
        ["Duplicate copies", formatCount(s.duplicateFiles), `${formatBytes(s.duplicateBytes)} wasted`],
        [`Older than ${oldYears} years`, formatCount(s.oldFiles), ""],
        ["Empty files", formatCount(s.emptyFiles), ""],
        ["Unreadable", formatCount(s.issues), ""],
      ],
      "    ",
    ),
  );

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
