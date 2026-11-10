import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse } from "yaml";
import { ConfigError } from "./errors.js";
import type { PluginHost } from "./plugin.js";
import type {
  AppConfig,
  CatalogConfig,
  CatalogDefinitionMapping,
  CleaningConfig,
  CliConfig,
  CliLocale,
  ExtractionConfig,
  GuardConfig,
  GuardMode,
  LogLevel,
  LoggingConfig,
  PiiConfig,
  PiiMode,
  PromptArgumentConfig,
  PromptConfig,
  ScanConfig,
  ServerConfig,
  SourceConfig,
  StoreConfig,
} from "./types.js";

export { ConfigError } from "./errors.js";

export const DEFAULT_CONFIG_FILE = "knot-sync.config.yaml";
export const DEFAULT_CATALOG_FILE = "knot-sync.catalog.yaml";

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
  "extraction",
  "pii",
  "guard",
  "server",
  "logging",
  "catalog",
  "prompts",
  "cli",
]);

const SERVER_KEYS = new Set(["audit_log"]);
const LOGGING_KEYS = new Set(["path", "level"]);
const LOG_LEVELS = new Set<LogLevel>(["info", "warn", "error"]);
const CLI_KEYS = new Set(["locale"]);
const CLI_LOCALES = new Set<CliLocale>(["en", "ja", "vi"]);
const CATALOG_KEYS = new Set([
  "path",
  "dictionary",
  "definition_excel",
  "definition_mapping",
]);

export const DEFAULT_DEFINITION_MAPPING: CatalogDefinitionMapping = {
  sheet: "項目",
  physical: "物理名",
  label_ja: "論理名",
  label_vi: "Tên nghiệp vụ",
  label_en: "Business name",
  description: "説明",
};

const PII_MODES = new Set<PiiMode>(["mask", "hash", "drop"]);
const PII_KEYS = new Set(["mode", "saltPath"]);

export const DEFAULT_PII_MODE: PiiMode = "mask";

const GUARD_MODES = new Set<GuardMode>(["flag", "strip", "block"]);
const GUARD_KEYS = new Set(["mode"]);

export const DEFAULT_GUARD_MODE: GuardMode = "flag";

/** Default audit log filename beside the store file. */
export const DEFAULT_AUDIT_LOG_NAME = "mcp-audit.jsonl";

/** Default operational system log filename beside the store file. */
export const DEFAULT_SYSTEM_LOG_NAME = "system.jsonl";

export const DEFAULT_LOG_LEVEL: LogLevel = "info";

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

const EXTRACTION_KEYS = ["maxFileSizeMb", "timeoutSeconds", "maxTextChars"] as const;

export const DEFAULT_EXTRACTION_CONFIG: ExtractionConfig = {
  maxFileSizeMb: 50,
  timeoutSeconds: 30,
  maxTextChars: 500_000,
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
  extraction: ExtractionConfig;
  pii: PiiConfig;
  guard: GuardConfig;
  server: ServerConfig;
  logging: LoggingConfig;
  catalog: CatalogConfig;
  prompts: PromptConfig[];
  cli: CliConfig;
  /** Plugin entries as written in config (relative paths or package names). */
  plugins: string[];
  /** Opaque top-level keys for plugins, keyed by plugin name. */
  pluginSettings: Record<string, unknown>;
}

/** Parse optional `cli:` section. */
export function parseCliConfig(raw: unknown): CliConfig {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError('"cli" must be an object (e.g. { locale: ja }).');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!CLI_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "cli". Allowed keys: locale.`,
      );
    }
  }
  if (obj.locale === undefined) {
    return {};
  }
  if (typeof obj.locale !== "string" || !CLI_LOCALES.has(obj.locale as CliLocale)) {
    throw new ConfigError(
      `"cli.locale" must be one of: en, ja, vi (got ${JSON.stringify(obj.locale)}).`,
    );
  }
  return { locale: obj.locale as CliLocale };
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

/** Parse optional `server:` section. `defaultAuditLog` is absolute. */
export function parseServerConfig(
  raw: unknown,
  defaultAuditLog: string,
  baseDir: string,
): ServerConfig {
  if (raw === undefined || raw === null) {
    return { auditLog: defaultAuditLog };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError('"server" must be an object (e.g. { audit_log: ./.data/mcp-audit.jsonl }).');
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!SERVER_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "server". Allowed keys: audit_log.`,
      );
    }
  }
  let auditLog = defaultAuditLog;
  if (obj.audit_log !== undefined) {
    if (typeof obj.audit_log !== "string" || obj.audit_log.trim() === "") {
      throw new ConfigError('"server.audit_log" must be a non-empty string.');
    }
    auditLog = resolvePath(baseDir, obj.audit_log);
  }
  return { auditLog };
}

/** Parse optional `logging:` section. `defaultPath` is absolute. */
export function parseLoggingConfig(
  raw: unknown,
  defaultPath: string,
  baseDir: string,
): LoggingConfig {
  if (raw === undefined || raw === null) {
    return { path: defaultPath, level: DEFAULT_LOG_LEVEL };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      '"logging" must be an object (e.g. { path: ./.data/system.jsonl, level: info }).',
    );
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!LOGGING_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "logging". Allowed keys: path, level.`,
      );
    }
  }
  let path = defaultPath;
  if (obj.path !== undefined) {
    if (typeof obj.path !== "string" || obj.path.trim() === "") {
      throw new ConfigError('"logging.path" must be a non-empty string.');
    }
    path = resolvePath(baseDir, obj.path);
  }
  let level: LogLevel = DEFAULT_LOG_LEVEL;
  if (obj.level !== undefined) {
    if (typeof obj.level !== "string" || !LOG_LEVELS.has(obj.level as LogLevel)) {
      throw new ConfigError(
        `"logging.level" must be one of: info, warn, error (got ${JSON.stringify(obj.level)}).`,
      );
    }
    level = obj.level as LogLevel;
  }
  return { path, level };
}

function parseDefinitionMapping(raw: unknown): CatalogDefinitionMapping {
  if (raw === undefined || raw === null) {
    return { ...DEFAULT_DEFINITION_MAPPING };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError('"catalog.definition_mapping" must be an object.');
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set([
    "sheet",
    "physical",
    "label_ja",
    "label_vi",
    "label_en",
    "description",
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "catalog.definition_mapping". ` +
          `Allowed keys: sheet, physical, label_ja, label_vi, label_en, description.`,
      );
    }
    if (obj[key] !== undefined && typeof obj[key] !== "string") {
      throw new ConfigError(`"catalog.definition_mapping.${key}" must be a string.`);
    }
  }
  const physical =
    typeof obj.physical === "string" && obj.physical.trim() !== ""
      ? obj.physical
      : DEFAULT_DEFINITION_MAPPING.physical;
  return {
    sheet: typeof obj.sheet === "string" ? obj.sheet : DEFAULT_DEFINITION_MAPPING.sheet,
    physical,
    label_ja:
      typeof obj.label_ja === "string" ? obj.label_ja : DEFAULT_DEFINITION_MAPPING.label_ja,
    label_vi:
      typeof obj.label_vi === "string" ? obj.label_vi : DEFAULT_DEFINITION_MAPPING.label_vi,
    label_en:
      typeof obj.label_en === "string" ? obj.label_en : DEFAULT_DEFINITION_MAPPING.label_en,
    description:
      typeof obj.description === "string"
        ? obj.description
        : DEFAULT_DEFINITION_MAPPING.description,
  };
}

/** Parse optional `catalog:` section. `defaultPath` is absolute. */
export function parseCatalogConfig(
  raw: unknown,
  defaultPath: string,
  baseDir: string,
): CatalogConfig {
  if (raw === undefined || raw === null) {
    return {
      path: defaultPath,
      definitionMapping: { ...DEFAULT_DEFINITION_MAPPING },
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      '"catalog" must be an object (e.g. { path: ./knot-sync.catalog.yaml }).',
    );
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!CATALOG_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "catalog". Allowed keys: path, dictionary, definition_excel, definition_mapping.`,
      );
    }
  }
  let path = defaultPath;
  if (obj.path !== undefined) {
    if (typeof obj.path !== "string" || obj.path.trim() === "") {
      throw new ConfigError('"catalog.path" must be a non-empty string.');
    }
    path = resolvePath(baseDir, obj.path);
  }
  let dictionary: string | undefined;
  if (obj.dictionary !== undefined) {
    if (typeof obj.dictionary !== "string" || obj.dictionary.trim() === "") {
      throw new ConfigError('"catalog.dictionary" must be a non-empty string.');
    }
    dictionary = resolvePath(baseDir, obj.dictionary);
  }
  let definitionExcel: string | undefined;
  if (obj.definition_excel !== undefined) {
    if (typeof obj.definition_excel !== "string" || obj.definition_excel.trim() === "") {
      throw new ConfigError('"catalog.definition_excel" must be a non-empty string.');
    }
    definitionExcel = resolvePath(baseDir, obj.definition_excel);
  }
  return {
    path,
    dictionary,
    definitionExcel,
    definitionMapping: parseDefinitionMapping(obj.definition_mapping),
  };
}

/** Parse optional `prompts:` list. */
export function parsePromptsConfig(raw: unknown): PromptConfig[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ConfigError('"prompts" must be a list of prompt objects.');
  }
  const prompts: PromptConfig[] = [];
  const names = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ConfigError(`prompts[${i}] must be an object.`);
    }
    const obj = item as Record<string, unknown>;
    const name = obj.name;
    const description = obj.description;
    const template = obj.template;
    if (typeof name !== "string" || name.trim() === "") {
      throw new ConfigError(
        `prompts[${i}].name must be a non-empty string (required fields: name, description, template).`,
      );
    }
    if (typeof description !== "string" || description.trim() === "") {
      throw new ConfigError(
        `prompts[${i}].description must be a non-empty string (required fields: name, description, template).`,
      );
    }
    if (typeof template !== "string" || template.trim() === "") {
      throw new ConfigError(
        `prompts[${i}].template must be a non-empty string (required fields: name, description, template).`,
      );
    }
    if (names.has(name)) {
      throw new ConfigError(`Duplicate prompt name "${name}".`);
    }
    names.add(name);
    const args = parsePromptArguments(obj.arguments, i);
    prompts.push({ name, description, template, arguments: args });
  }
  return prompts;
}

function parsePromptArguments(raw: unknown, promptIndex: number): PromptArgumentConfig[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ConfigError(`prompts[${promptIndex}].arguments must be a list.`);
  }
  const out: PromptArgumentConfig[] = [];
  for (let j = 0; j < raw.length; j++) {
    const item = raw[j];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ConfigError(`prompts[${promptIndex}].arguments[${j}] must be an object.`);
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.name !== "string" || obj.name.trim() === "") {
      throw new ConfigError(`prompts[${promptIndex}].arguments[${j}].name must be a non-empty string.`);
    }
    if (typeof obj.description !== "string" || obj.description.trim() === "") {
      throw new ConfigError(
        `prompts[${promptIndex}].arguments[${j}].description must be a non-empty string.`,
      );
    }
    const required = obj.required === undefined ? false : Boolean(obj.required);
    out.push({ name: obj.name, description: obj.description, required });
  }
  return out;
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

function assertPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`"${field}" must be a positive number.`);
  }
  return value;
}

/** Parse optional `extraction:` section; omitted keys use defaults. */
export function parseExtractionConfig(raw: unknown): ExtractionConfig {
  if (raw === undefined || raw === null) {
    return { ...DEFAULT_EXTRACTION_CONFIG };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      '"extraction" must be an object (e.g. { maxFileSizeMb: 50, timeoutSeconds: 30 }).',
    );
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set<string>(EXTRACTION_KEYS);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "extraction". Allowed keys: ${EXTRACTION_KEYS.join(", ")}.`,
      );
    }
  }
  return {
    maxFileSizeMb:
      obj.maxFileSizeMb === undefined
        ? DEFAULT_EXTRACTION_CONFIG.maxFileSizeMb
        : assertPositiveNumber(obj.maxFileSizeMb, "extraction.maxFileSizeMb"),
    timeoutSeconds:
      obj.timeoutSeconds === undefined
        ? DEFAULT_EXTRACTION_CONFIG.timeoutSeconds
        : assertPositiveNumber(obj.timeoutSeconds, "extraction.timeoutSeconds"),
    maxTextChars:
      obj.maxTextChars === undefined
        ? DEFAULT_EXTRACTION_CONFIG.maxTextChars
        : assertPositiveNumber(obj.maxTextChars, "extraction.maxTextChars"),
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
  const extraction = parseExtractionConfig(c.extraction);

  const storePath = resolvePath(
    baseDir,
    typeof store.path === "string" ? store.path : ".data/store.sqlite",
  );
  const defaultSaltPath = resolve(dirname(storePath), "pii-salt");
  const pii = parsePiiConfig(c.pii, defaultSaltPath, baseDir);
  const guard = parseGuardConfig(c.guard);
  const defaultAuditLog = resolve(dirname(storePath), DEFAULT_AUDIT_LOG_NAME);
  const server = parseServerConfig(c.server, defaultAuditLog, baseDir);
  const defaultSystemLog = resolve(dirname(storePath), DEFAULT_SYSTEM_LOG_NAME);
  const logging = parseLoggingConfig(c.logging, defaultSystemLog, baseDir);
  if (logging.path === storePath) {
    throw new ConfigError(
      '"logging.path" must not be the same as store.path. ' +
        "Use a separate JSONL file (e.g. ./.data/system.jsonl).",
    );
  }
  if (logging.path === server.auditLog) {
    throw new ConfigError(
      '"logging.path" must not be the same as server.audit_log. ' +
        "Keep operational system logs and MCP audit logs in separate files.",
    );
  }
  const defaultCatalogPath = resolve(baseDir, DEFAULT_CATALOG_FILE);
  const catalog = parseCatalogConfig(c.catalog, defaultCatalogPath, baseDir);
  const prompts = parsePromptsConfig(c.prompts);
  const cli = parseCliConfig(c.cli);

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
    extraction,
    pii,
    guard,
    server,
    logging,
    catalog,
    prompts,
    cli,
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
    extraction: structural.extraction,
    pii: structural.pii,
    guard: structural.guard,
    server: structural.server,
    logging: structural.logging,
    catalog: structural.catalog,
    prompts: structural.prompts,
    cli: structural.cli,
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
# OCR (Docling via local Docker) — not a built-in; enable explicitly:
#   docker pull quay.io/docling-project/docling-serve-cpu:v1.38.2
#   export KNOT_SYNC_OCR_LICENSE=your-key
# 方眼紙 / form Excel (heuristics) — not a built-in; enable explicitly:
#   export KNOT_SYNC_HOUSEN_LICENSE=your-key
# Enterprise SQL (mssql/oracle/access/as400) — not a built-in; enable explicitly:
#   export KNOT_SYNC_SQL_ENTERPRISE_LICENSE=your-key
#   # URL examples (never put secrets in this file — use env:NAME only):
#   #   export KNOT_MSSQL_URL='mssql://user:pass@host:1433/db?encrypt=true&ApplicationIntent=ReadOnly'
#   #   export KNOT_ORACLE_URL='oracle://user:pass@host:1521/ORCLPDB1'
#   #   export KNOT_ACCESS_ODBC='Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=C:\data\legacy.accdb;ReadOnly=1'
#   #   export KNOT_AS400_ODBC='Driver={IBM i Access ODBC Driver};System=ibmi;Uid=USER;Pwd=SECRET'
# OAuth 2.1-style HTTP MCP auth (scopes) — not a built-in; enable explicitly:
#   export KNOT_SYNC_OAUTH_LICENSE=your-key
#   export KNOT_SYNC_OAUTH_SIGNING_SECRET=long-random-secret
#   export KNOT_SYNC_OAUTH_CLIENT_ID=agent-a
#   export KNOT_SYNC_OAUTH_CLIENT_SECRET=agent-secret
#   # KNOT_SYNC_API_KEY remains a full-access fallback when the plugin is loaded
# plugins:
#   - ./plugins/mask-company-id.mjs
#   - ../packages/extractor-ocr/dist/index.js   # monorepo path example
#   - ../packages/extractor-housen/dist/index.js
#   - ../packages/connector-sql-enterprise/dist/index.js
#   - ../packages/auth-oauth/dist/index.js
#   - ../packages/catalog-llm/dist/index.js
#   - ../packages/search-vector/dist/index.js
#   - ../packages/guard-llm/dist/index.js
# extractor-ocr:
#   # image: quay.io/docling-project/docling-serve-cpu:v1.38.2
#   # timeoutSeconds: 120
#   # licenseEnv: KNOT_SYNC_OCR_LICENSE
#   # licenseKey: knot-sync-ocr-dev   # tests / local only
#   # maxInputMb: 50
# extractor-housen:
#   # formThreshold: 0.42
#   # timeoutSeconds: 30
#   # licenseEnv: KNOT_SYNC_HOUSEN_LICENSE
#   # licenseKey: knot-sync-housen-dev   # tests / local only
#   # maxInputMb: 50
# connector-sql-enterprise:
#   # licenseEnv: KNOT_SYNC_SQL_ENTERPRISE_LICENSE
#   # licenseKey: knot-sync-sql-enterprise-dev   # tests / local only
# auth-oauth:
#   # licenseEnv: KNOT_SYNC_OAUTH_LICENSE
#   # licenseKey: knot-sync-oauth-dev   # tests / local only
#   # issuer: knot-sync-local
#   # audience: knot-sync-mcp
#   # tokenPath: /oauth/token
#   # jwksUrl: https://keycloak.internal/.../certs   # optional on-prem IdP
#   # defaultScopes: [tool:*, resource:*]
# catalog-llm:   # local LLM for blank catalog columns (Ollama / Docker OpenAI-compatible)
#   # export KNOT_SYNC_CATALOG_LLM_LICENSE=your-key
#   # model: llama3.2
#   # baseUrl: http://127.0.0.1:11434/v1          # Ollama default
#   # baseUrl: http://127.0.0.1:8080/v1           # Docker example
#   # timeoutMs: 30000
#   # includeSamples: false
#   # licenseEnv: KNOT_SYNC_CATALOG_LLM_LICENSE
#   # licenseKey: knot-sync-catalog-llm-dev       # tests / local only
# search-vector:  # local embeddings + search_similar (Ollama / Docker OpenAI-compatible)
#   # export KNOT_SYNC_SEARCH_VECTOR_LICENSE=your-key
#   # model: nomic-embed-text
#   # baseUrl: http://127.0.0.1:11434/v1
#   # timeoutMs: 30000
#   # maxChars: 8000
#   # lazyMaxDocs: 20
#   # embedOnRun: false
#   # licenseEnv: KNOT_SYNC_SEARCH_VECTOR_LICENSE
#   # licenseKey: knot-sync-search-vector-dev     # tests / local only
# guard-llm:  # local LLM enricher after rule-based PII/guard (Ollama / Docker OpenAI-compatible)
#   # export KNOT_SYNC_GUARD_LLM_LICENSE=your-key
#   # model: llama3.2
#   # baseUrl: http://127.0.0.1:11434/v1          # Ollama default
#   # baseUrl: http://127.0.0.1:8080/v1           # Docker example
#   # timeoutMs: 30000
#   # maxChars: 8000
#   # licenseEnv: KNOT_SYNC_GUARD_LLM_LICENSE
#   # licenseKey: knot-sync-guard-llm-dev         # tests / local only

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

# Optional extraction limits for "knot-sync run" (soft-fail oversized / timed-out files).
# extraction:
#   maxFileSizeMb: 50      # SKIPPED_TOO_LARGE over this size
#   timeoutSeconds: 30     # EXTRACT_TIMEOUT per file
#   maxTextChars: 500000   # truncate large csv/tsv/txt/md

# Optional PII masking applied by "knot-sync run" after cleaning (default mode: mask).
# pii:
#   mode: mask   # mask | hash | drop
#   # saltPath: ./.data/pii-salt

# Optional prompt-injection guard applied by "knot-sync run" after PII (default mode: flag).
# guard:
#   mode: flag   # flag | strip | block

# Optional MCP server settings for "knot-sync serve".
# server:
#   audit_log: ./.data/mcp-audit.jsonl
# For "knot-sync serve --http", set API key in the environment (never in YAML):
#   export KNOT_SYNC_API_KEY=your-shared-secret

# Optional local operational system logs (JSONL). Distinct from server.audit_log.
# Fully local — no remote shipping / telemetry. Rotate or truncate externally if large.
# logging:
#   path: ./.data/system.jsonl   # default beside the store; must stay outside sources
#   level: info                  # info | warn | error

# Optional CLI locale for help/errors (en | ja | vi). Override with --lang.
# cli:
#   locale: ja

# Optional MCP prompts (name must be unique).
# prompts:
#   - name: find-invoice
#     description: Find invoice-like documents
#     arguments:
#       - name: query
#         description: Search terms
#         required: true
#     template: |
#       Search KnotSync for invoices matching: {{query}}
`;
}
