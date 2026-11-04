import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse } from "yaml";
import type { AppConfig, FsSourceConfig, SourceConfig } from "./types.js";

export const DEFAULT_CONFIG_FILE = "knot-sync.config.yaml";

/** Folders that are never useful and often huge or protected. */
export const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  ".svn",
  "$RECYCLE.BIN",
  "System Volume Information",
  ".Trash",
  ".Trashes",
];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function resolvePath(baseDir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(baseDir, p);
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ConfigError(`"${field}" must be a list of strings.`);
  }
  return value as string[];
}

function normalizeExt(ext: string): string {
  const e = ext.trim().toLowerCase();
  return e.startsWith(".") ? e : `.${e}`;
}

function parseSource(raw: unknown, index: number, baseDir: string): SourceConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError(`sources[${index}] must be an object.`);
  }
  const s = raw as Record<string, unknown>;
  const id = s.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new ConfigError(
      `sources[${index}].id must be lower-case letters, digits, "-" or "_" (got ${JSON.stringify(id)}).`,
    );
  }
  if (s.type !== "fs") {
    throw new ConfigError(
      `sources[${index}].type "${String(s.type)}" is not supported yet. Supported: fs.`,
    );
  }
  if (typeof s.path !== "string" || s.path.trim() === "") {
    throw new ConfigError(`sources[${index}].path is required.`);
  }
  const source: FsSourceConfig = {
    id,
    type: "fs",
    path: resolvePath(baseDir, s.path),
    extensions: asStringArray(s.extensions, `sources[${index}].extensions`).map(normalizeExt),
    exclude: [...DEFAULT_EXCLUDES, ...asStringArray(s.exclude, `sources[${index}].exclude`)],
  };
  return source;
}

/** Parse YAML text into a validated config. Paths resolve from `baseDir`. */
export function parseConfig(yamlText: string, baseDir: string): AppConfig {
  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (err) {
    throw new ConfigError(`Invalid YAML: ${(err as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError("Config must be a YAML object.");
  }
  const c = raw as Record<string, unknown>;

  if (!Array.isArray(c.sources) || c.sources.length === 0) {
    throw new ConfigError('"sources" must list at least one source.');
  }
  const sources = c.sources.map((s, i) => parseSource(s, i, baseDir));
  const ids = new Set<string>();
  for (const s of sources) {
    if (ids.has(s.id)) throw new ConfigError(`Duplicate source id "${s.id}".`);
    ids.add(s.id);
  }

  const store = (c.store ?? {}) as Record<string, unknown>;
  const scan = (c.scan ?? {}) as Record<string, unknown>;
  const oldFileYears = scan.old_file_years ?? 5;
  if (typeof oldFileYears !== "number" || oldFileYears <= 0) {
    throw new ConfigError('"scan.old_file_years" must be a positive number.');
  }

  return {
    baseDir,
    sources,
    store: {
      path: resolvePath(
        baseDir,
        typeof store.path === "string" ? store.path : ".data/store.sqlite",
      ),
    },
    scan: {
      oldFileYears,
      hash: scan.hash === undefined ? true : Boolean(scan.hash),
    },
  };
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const abs = resolve(configPath);
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch {
    throw new ConfigError(
      `Config file not found: ${abs}\nRun "knot-sync init" to create one.`,
    );
  }
  return parseConfig(text, dirname(abs));
}

/** Starter config written by `init`. */
export function starterConfigYaml(sourcePath = "./data-to-scan"): string {
  return `# KnotSync config
# Docs: https://www.npmjs.com/package/@hoanghainh/knot-sync

sources:
  - id: shared-folder          # lower-case, unique
    type: fs                   # fs = folder on disk (read-only)
    path: ${sourcePath}
    # Only scan these types. Remove the line to scan everything.
    extensions: [.xlsx, .xls, .docx, .doc, .pdf, .csv, .txt]
    # Extra folder/file names to skip (node_modules, .git, $RECYCLE.BIN are always skipped).
    exclude: []

store:
  path: ./.data/store.sqlite   # one SQLite file, safe to delete

scan:
  old_file_years: 5            # files older than this are reported as "old"
  hash: true                   # sha256 for duplicate detection (slower on big shares)
`;
}
