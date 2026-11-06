import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse } from "yaml";
import { ConfigError } from "./errors.js";
import type { PluginHost } from "./plugin.js";
import type {
  AppConfig,
  CleaningConfig,
  GuardConfig,
  GuardMode,
  PiiConfig,
  PiiMode,
  ScanConfig,
  SourceConfig,
  StoreConfig,
} from "./types.js";

export { ConfigError } from "./errors.js";

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

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const CORE_TOP_LEVEL_KEYS = new Set([
  "sources",
  "store",
  "scan",
  "plugins",
  "cleaning",
  "pii",
  "guard",
]);

const PII_MODES = new Set<PiiMode>(["mask", "hash", "drop"]);
const PII_KEYS = new Set(["mode", "saltPath"]);

export const DEFAULT_PII_MODE: PiiMode = "mask";

const GUARD_MODES = new Set<GuardMode>(["flag", "strip", "block"]);
const GUARD_KEYS = new Set(["mode"]);

export const DEFAULT_GUARD_MODE: GuardMode = "flag";

const CLEANING_KEYS = [
  "nfkc",
  "wareki",
  "datesIso",
  "legacyVietnamese",
  "tokenReduce",
] as const;

export const DEFAULT_CLEANING_CONFIG: CleaningConfig = {
  nfkc: true,
  wareki: true,
  datesIso: true,
  legacyVietnamese: true,
  tokenReduce: true,
};

export function resolvePath(baseDir: string, p: string): string {
  return isAbsolute(p) ? p : resolve(baseDir, p);
}

export function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ConfigError(`"${field}" must be a list of strings.`);
  }
  return value as string[];
}

export function normalizeExt(ext: string): string {
  const e = ext.trim().toLowerCase();
  return e.startsWith(".") ? e : `.${e}`;
}

export function assertSourceId(id: unknown, index: number): string {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new ConfigError(
      `sources[${index}].id must be lower-case letters, digits, "-" or "_" (got ${JSON.stringify(id)}).`,
    );
  }
  return id;
}

/** Config after YAML parse, before connectors validate each source. */
export interface StructuralConfig {
  baseDir: string;
  rawSources: Record<string, unknown>[];
  store: StoreConfig;
  scan: ScanConfig;
  cleaning: CleaningConfig;
  pii: PiiConfig;
  guard: GuardConfig;
  /** Plugin entries as written in config (relative paths or package names). */
  plugins: string[];
  /** Opaque top-level keys for plugins, keyed by plugin name. */
  pluginSettings: Record<string, unknown>;
}

/** Parse optional `guard:` section. */
export function parseGuardConfig(raw: unknown): GuardConfig {
  if (raw === undefined || raw === null) {
    return { mode: DEFAULT_GUARD_MODE };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError('"guard" must be an object (e.g. { mode: flag }).');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!GUARD_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "guard". Allowed keys: mode.`,
      );
    }
  }
  let mode: GuardMode = DEFAULT_GUARD_MODE;
  if (obj.mode !== undefined) {
    if (typeof obj.mode !== "string" || !GUARD_MODES.has(obj.mode as GuardMode)) {
      throw new ConfigError(
        `"guard.mode" must be one of: flag, strip, block (got ${JSON.stringify(obj.mode)}).`,
      );
    }
    mode = obj.mode as GuardMode;
  }
  return { mode };
}

/** Parse optional `pii:` section. `defaultSaltPath` is absolute. */
export function parsePiiConfig(raw: unknown, defaultSaltPath: string, baseDir: string): PiiConfig {
  if (raw === undefined || raw === null) {
    return { mode: DEFAULT_PII_MODE, saltPath: defaultSaltPath };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError('"pii" must be an object (e.g. { mode: mask }).');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!PII_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "pii". Allowed keys: mode, saltPath.`,
      );
    }
  }
  let mode: PiiMode = DEFAULT_PII_MODE;
  if (obj.mode !== undefined) {
    if (typeof obj.mode !== "string" || !PII_MODES.has(obj.mode as PiiMode)) {
      throw new ConfigError(
        `"pii.mode" must be one of: mask, hash, drop (got ${JSON.stringify(obj.mode)}).`,
      );
    }
    mode = obj.mode as PiiMode;
  }
  let saltPath = defaultSaltPath;
  if (obj.saltPath !== undefined) {
    if (typeof obj.saltPath !== "string" || obj.saltPath.trim() === "") {
      throw new ConfigError('"pii.saltPath" must be a non-empty string.');
    }
    saltPath = resolvePath(baseDir, obj.saltPath);
  }
  return { mode, saltPath };
}

/** Parse optional `cleaning:` section; omitted keys default to true. */
export function parseCleaningConfig(raw: unknown): CleaningConfig {
  if (raw === undefined || raw === null) {
    return { ...DEFAULT_CLEANING_CONFIG };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError('"cleaning" must be an object with boolean step toggles.');
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set<string>(CLEANING_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "cleaning". Allowed keys: ${CLEANING_KEYS.join(", ")}.`,
      );
    }
    if (typeof obj[key] !== "boolean") {
      throw new ConfigError(
        `"cleaning.${key}" must be a boolean (true/false).`,
      );
    }
  }
  return {
    nfkc: typeof obj.nfkc === "boolean" ? obj.nfkc : true,
    wareki: typeof obj.wareki === "boolean" ? obj.wareki : true,
    datesIso: typeof obj.datesIso === "boolean" ? obj.datesIso : true,
    legacyVietnamese:
      typeof obj.legacyVietnamese === "boolean" ? obj.legacyVietnamese : true,
    tokenReduce: typeof obj.tokenReduce === "boolean" ? obj.tokenReduce : true,
  };
}

function parsePluginsList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
    throw new ConfigError('"plugins" must be a list of strings (package names or relative paths).');
  }
  const list = raw as string[];
  const seen = new Set<string>();
  for (const entry of list) {
    if (entry.trim() === "") {
      throw new ConfigError('"plugins" entries must be non-empty strings.');
    }
    if (seen.has(entry)) {
      throw new ConfigError(
        `Duplicate plugins entry "${entry}". List each plugin only once.`,
      );
    }
    seen.add(entry);
  }
  return list;
}

/** Parse YAML text into a structural config. Source types are not validated yet. */
export function parseConfig(yamlText: string, baseDir: string): StructuralConfig {
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

  const rawSources: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < c.sources.length; i++) {
    const item = c.sources[i];
    if (typeof item !== "object" || item === null) {
      throw new ConfigError(`sources[${i}] must be an object.`);
    }
    const s = item as Record<string, unknown>;
    const id = assertSourceId(s.id, i);
    if (ids.has(id)) throw new ConfigError(`Duplicate source id "${id}".`);
    ids.add(id);
    if (typeof s.type !== "string" || s.type.trim() === "") {
      throw new ConfigError(`sources[${i}].type is required (a non-empty string).`);
    }
    rawSources.push(s);
  }

  const store = (c.store ?? {}) as Record<string, unknown>;
  const scan = (c.scan ?? {}) as Record<string, unknown>;
  const oldFileYears = scan.old_file_years ?? 5;
  if (typeof oldFileYears !== "number" || oldFileYears <= 0) {
    throw new ConfigError('"scan.old_file_years" must be a positive number.');
  }

  const plugins = parsePluginsList(c.plugins);
  const cleaning = parseCleaningConfig(c.cleaning);

  const storePath = resolvePath(
    baseDir,
    typeof store.path === "string" ? store.path : ".data/store.sqlite",
  );
  const defaultSaltPath = resolve(dirname(storePath), "pii-salt");
  const pii = parsePiiConfig(c.pii, defaultSaltPath, baseDir);
  const guard = parseGuardConfig(c.guard);

  const pluginSettings: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(c)) {
    if (CORE_TOP_LEVEL_KEYS.has(key)) continue;
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    pluginSettings[key] = value;
  }

  return {
    baseDir,
    rawSources,
    store: { path: storePath },
    scan: {
      oldFileYears,
      hash: scan.hash === undefined ? true : Boolean(scan.hash),
    },
    cleaning,
    pii,
    guard,
    plugins,
    pluginSettings,
  };
}

/** Resolve each source through the connector registry on the plugin host. */
export function resolveConfig(structural: StructuralConfig, host: PluginHost): AppConfig {
  const sources: SourceConfig[] = structural.rawSources.map((raw, index) => {
    const type = String(raw.type);
    const connector = host.getConnector(type);
    if (!connector) {
      const supported = host.listConnectorIds();
      const list = supported.length > 0 ? supported.join(", ") : "(none registered)";
      throw new ConfigError(
        `sources[${index}].type "${type}" is not supported. Registered connector types: ${list}.`,
      );
    }
    return connector.parseSource(raw, { baseDir: structural.baseDir, index });
  });

  return {
    baseDir: structural.baseDir,
    sources,
    store: structural.store,
    scan: structural.scan,
    cleaning: structural.cleaning,
    pii: structural.pii,
    guard: structural.guard,
    plugins: structural.plugins,
    pluginSettings: structural.pluginSettings,
  };
}

export async function loadConfig(configPath: string): Promise<StructuralConfig> {
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
    type: fs                   # fs = folder on disk (read-only); types come from connector plugins
    path: ${sourcePath}
    # Only scan these types. Remove the line to scan everything.
    extensions: [.xlsx, .xls, .docx, .doc, .pdf, .csv, .txt]
    # Extra folder/file names to skip (node_modules, .git, $RECYCLE.BIN are always skipped).
    exclude: []

# Optional extra plugins (npm package names or paths relative to this file).
# Built-in plugins (fs connector) always load. Plugins run in-process with full trust —
# install only plugins you trust. Paid plugins check their own license keys.
# plugins:
#   - ./plugins/mask-company-id.mjs

store:
  path: ./.data/store.sqlite   # one SQLite file, safe to delete

scan:
  old_file_years: 5            # files older than this are reported as "old"
  hash: true                   # sha256 for duplicate detection (slower on big shares)

# Optional JA/VN cleaning steps applied by "knot-sync run" after extract (all true by default).
# cleaning:
#   nfkc: true
#   wareki: true
#   datesIso: true
#   legacyVietnamese: true
#   tokenReduce: true

# Optional PII masking applied by "knot-sync run" after cleaning (default mode: mask).
# pii:
#   mode: mask   # mask | hash | drop
#   # saltPath: ./.data/pii-salt

# Optional prompt-injection guard applied by "knot-sync run" after PII (default mode: flag).
# guard:
#   mode: flag   # flag | strip | block
`;
}
