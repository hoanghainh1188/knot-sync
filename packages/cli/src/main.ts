import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { scanFs } from "@hoanghainh/knot-sync-connector-fs";
import {
  ConfigError,
  DEFAULT_CONFIG_FILE,
  loadConfig,
  starterConfigYaml,
  type FileEntry,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";
import { Store, type SourceStats } from "@hoanghainh/knot-sync-store-sqlite";
import { formatBytes, formatCount, table } from "./format.js";

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
  run       (coming soon) Extract, clean and mask personal data
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
      case "serve":
        io.err(`"${command}" is not available yet. It is planned for a later v0.1 milestone.`);
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
  const config = await loadConfig(configPath);
  const store = new Store(config.store.path);
  const results: ScanResult[] = [];

  try {
    for (const source of config.sources) {
      const files: FileEntry[] = [];
      const issues: ScanIssue[] = [];
      let lastShown = 0;

      for await (const entry of scanFs(source, {
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
