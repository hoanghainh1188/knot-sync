import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ConfigError } from "./errors.js";
import type { Document, FileEntry, ScanIssue, SourceConfig } from "./types.js";

/** Host plugin API version. Plugins must declare the same number. */
export const PLUGIN_API_VERSION = 1;

export type ExtensionPoint =
  | "connector"
  | "extractor"
  | "cleaner"
  | "pii-rule"
  | "guard-rule"
  | "catalog-source"
  | "mcp-tool"
  | "mcp-prompt"
  | "mcp-auth";

/** Result of authenticating an HTTP Authorization header. */
export type McpAuthResult =
  | {
      ok: true;
      /** Client / subject id for audit (never a secret). */
      subject: string;
      /** Granted scopes, e.g. tool:search_documents, resource:*. */
      scopes: string[];
      via: "oauth" | "apiKey";
    }
  | { ok: false; status?: number; message?: string };

/**
 * Optional HTTP MCP auth provider (paid oauth plugin).
 * When absent, serve --http uses shared API key only.
 */
export interface McpAuthProvider {
  id: string;
  authenticate(authorizationHeader: string | undefined): Promise<McpAuthResult> | McpAuthResult;
  authorizeTool(toolId: string, auth: Extract<McpAuthResult, { ok: true }>): boolean;
  authorizeResource(uri: string, auth: Extract<McpAuthResult, { ok: true }>): boolean;
  /**
   * Optional HTTP handler for token issuance (e.g. POST /oauth/token).
   * Return true if the request was fully handled.
   */
  handleHttp?(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    url: URL,
  ): Promise<boolean> | boolean;
}

export interface ParseSourceContext {
  baseDir: string;
  index: number;
}

export interface ConnectorScanOptions {
  hash?: boolean;
  onIssue?: (issue: ScanIssue) => void;
}

export interface Connector {
  id: string;
  parseSource(raw: Record<string, unknown>, ctx: ParseSourceContext): SourceConfig;
  scan(source: SourceConfig, options?: ConnectorScanOptions): AsyncGenerator<FileEntry>;
}

export interface ExtractContext {
  /** AbortSignal for per-file extraction timeout. */
  signal?: AbortSignal;
  /** Soft-fail with SKIPPED_TOO_LARGE when file.size exceeds this. */
  maxFileSizeBytes?: number;
  /** Cap characters from delimited / plain-text extraction. */
  maxTextChars?: number;
}

export type ExtractResult =
  | { ok: true; document: Document }
  | { ok: false; code: string; message: string };

/** Turns an inventory file into a Document. */
export interface Extractor {
  id: string;
  /** Lower-case extensions with dot, e.g. ".xlsx". */
  extensions: string[];
  extract(file: FileEntry, ctx?: ExtractContext): Promise<ExtractResult>;
}

/** Transforms an extracted Document in-memory (no source writes, no network). */
export interface Cleaner {
  id: string;
  clean(document: Document): Document | Promise<Document>;
}

/** Detects PII spans in a plain-text string (no network, no source writes). */
export interface PiiRule {
  id: string;
  find(text: string): Array<{ start: number; end: number }>;
}

/** Detects prompt-injection / risky spans in a plain-text string (no network, no source writes). */
export interface GuardRule {
  id: string;
  find(text: string): Array<{ start: number; end: number }>;
}

/** Input for catalog-source suggestions during `describe`. */
export interface CatalogSuggestInput {
  sourceId: string;
  table: string;
  column: string;
  dbType?: string;
  sampleValues?: string[];
}

/** Suggested catalog fields from a CatalogSource (partial). */
export interface CatalogSuggestion {
  label?: { ja?: string; vi?: string; en?: string };
  description?: string;
  values?: string[];
  pii?: boolean;
}

/**
 * Executable catalog-source: suggests labels/descriptions for one column
 * without network I/O or writing to customer sources.
 */
export interface CatalogSource {
  id: string;
  suggest(
    input: CatalogSuggestInput,
  ): CatalogSuggestion | Promise<CatalogSuggestion>;
}

/** Opaque context passed to MCP tool handlers (filled by the MCP host). */
export type McpHandlerContext = Record<string, unknown>;

export interface McpToolResult {
  /** Framed text (and any other human-readable payload) for the MCP client. */
  content: string;
  /** Optional structured extras (e.g. hit count, guard flags). */
  meta?: Record<string, unknown>;
}

/** Executable MCP tool registered via the plugin API. */
export interface McpTool {
  id: string;
  description: string;
  /** JSON Schema object describing tool inputs (MCP-compatible). */
  inputSchema: Record<string, unknown>;
  handler(args: unknown, ctx: McpHandlerContext): Promise<McpToolResult> | McpToolResult;
}

/** Executable MCP prompt registered via the plugin API. */
export interface McpPrompt {
  id: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  template: string;
}

export interface PluginApi {
  registerConnector(connector: Connector): void;
  registerExtractor(extractor: Extractor): void;
  registerCleaner(cleaner: Cleaner): void;
  registerPiiRule(rule: PiiRule): void;
  registerGuardRule(rule: GuardRule): void;
  registerCatalogSource(source: CatalogSource): void;
  registerMcpTool(tool: McpTool): void;
  registerMcpPrompt(prompt: McpPrompt): void;
  /** At most one mcp-auth provider (paid oauth). */
  registerMcpAuthProvider(provider: McpAuthProvider): void;
  /** Opaque settings under the plugin's config key, or undefined. */
  getPluginSettings(): unknown;
}

export interface KnotSyncPlugin {
  name: string;
  version: string;
  apiVersion: number;
  register(api: PluginApi): void;
}

export interface RegisteredExtension {
  point: ExtensionPoint;
  id: string;
}

export interface LoadedPluginInfo {
  name: string;
  version: string;
  extensions: RegisteredExtension[];
}

export interface PluginHost {
  connectors: Map<string, Connector>;
  extractors: Map<string, Extractor>;
  cleaners: Map<string, Cleaner>;
  piiRules: Map<string, PiiRule>;
  guardRules: Map<string, GuardRule>;
  catalogSources: Map<string, CatalogSource>;
  mcpTools: Map<string, McpTool>;
  mcpPrompts: Map<string, McpPrompt>;
  /** Present when a paid oauth (or test) plugin registered an auth provider. */
  mcpAuthProvider?: McpAuthProvider;
  loaded: LoadedPluginInfo[];
  getConnector(type: string): Connector | undefined;
  listConnectorIds(): string[];
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Plugin ${field} must be a non-empty string.`);
  }
  return value;
}

function assertPluginShape(mod: unknown, label: string): KnotSyncPlugin {
  if (typeof mod !== "object" || mod === null) {
    throw new ConfigError(
      `Plugin ${label} did not export an object. Export default { name, version, apiVersion, register }.`,
    );
  }
  const p = mod as Record<string, unknown>;
  requireNonEmptyString(p.name, `name (${label})`);
  requireNonEmptyString(p.version, `version (${label})`);
  if (typeof p.apiVersion !== "number" || !Number.isInteger(p.apiVersion) || p.apiVersion <= 0) {
    throw new ConfigError(
      `Plugin ${label} apiVersion must be a positive integer. Fix the plugin or remove it from plugins:.`,
    );
  }
  if (typeof p.register !== "function") {
    throw new ConfigError(
      `Plugin ${label} is missing register(api). Export default { name, version, apiVersion, register }.`,
    );
  }
  // Keep the original object so `register` retains its `this` binding.
  return mod as KnotSyncPlugin;
}

/** True for filesystem paths; false for bare / scoped npm package names. */
export function isPluginPathEntry(entry: string): boolean {
  if (entry.startsWith("file:") || entry.startsWith(".") || isAbsolute(entry)) return true;
  if (entry.startsWith("@")) return false; // @scope/pkg is a package name
  return entry.includes("/") || entry.includes("\\");
}

/**
 * Resolve a plugins: entry to something `import()` can load.
 * Paths become file: URLs; package names resolve from the config directory.
 */
export function resolvePluginSpecifier(entry: string, baseDir: string): string {
  if (entry.startsWith("file:")) return entry;
  if (isPluginPathEntry(entry)) {
    return pathToFileURL(resolve(baseDir, entry)).href;
  }
  try {
    const requireFromConfig = createRequire(join(baseDir, "package.json"));
    return pathToFileURL(requireFromConfig.resolve(entry)).href;
  } catch (err) {
    throw new ConfigError(
      `Could not resolve plugin package "${entry}" from ${baseDir}: ${(err as Error).message}\n` +
        `Install the package next to the config, or use a relative path like ./plugins/my-plugin.mjs.`,
    );
  }
}

export interface CreatePluginHostOptions {
  pluginSettings?: Record<string, unknown>;
}

/** Create an empty host. Prefer `loadPlugins` for production use. */
export function createPluginHost(options: CreatePluginHostOptions = {}): PluginHost & {
  registerPlugin(plugin: KnotSyncPlugin): void;
} {
  const pluginSettings = options.pluginSettings ?? {};
  const connectors = new Map<string, Connector>();
  const extractors = new Map<string, Extractor>();
  const cleaners = new Map<string, Cleaner>();
  const piiRules = new Map<string, PiiRule>();
  const guardRules = new Map<string, GuardRule>();
  const catalogSources = new Map<string, CatalogSource>();
  const mcpTools = new Map<string, McpTool>();
  const mcpPrompts = new Map<string, McpPrompt>();
  let mcpAuthProvider: McpAuthProvider | undefined;
  const loaded: LoadedPluginInfo[] = [];
  const pluginNames = new Set<string>();

  function registerInMap<T extends { id: string }>(
    map: Map<string, T>,
    point: ExtensionPoint,
    item: T,
    pluginName: string,
    extensions: RegisteredExtension[],
  ): void {
    if (typeof item.id !== "string" || item.id.trim() === "") {
      throw new ConfigError(
        `Plugin "${pluginName}" registered a ${point} without an id. Give it a non-empty id.`,
      );
    }
    const existing = map.get(item.id);
    if (existing) {
      const other =
        loaded.find((p) => p.extensions.some((e) => e.point === point && e.id === item.id))
          ?.name ?? "another plugin";
      throw new ConfigError(
        `Duplicate ${point} id "${item.id}" from plugins "${other}" and "${pluginName}". ` +
          `Remove one from plugins: or change the id.`,
      );
    }
    map.set(item.id, item);
    extensions.push({ point, id: item.id });
  }

  function registerPlugin(plugin: KnotSyncPlugin): void {
    if (plugin.apiVersion !== PLUGIN_API_VERSION) {
      throw new ConfigError(
        `Plugin "${plugin.name}" apiVersion ${plugin.apiVersion} is not supported ` +
          `(host supports ${PLUGIN_API_VERSION}). Update the plugin or remove it from plugins:.`,
      );
    }
    if (pluginNames.has(plugin.name)) {
      throw new ConfigError(
        `Duplicate plugin name "${plugin.name}". List each plugin only once in plugins:.`,
      );
    }
    pluginNames.add(plugin.name);

    const extensions: RegisteredExtension[] = [];
    const api: PluginApi = {
      registerConnector: (c) => registerInMap(connectors, "connector", c, plugin.name, extensions),
      registerExtractor: (e) => {
        if (!Array.isArray(e.extensions) || e.extensions.some((x) => typeof x !== "string")) {
          throw new ConfigError(
            `Plugin "${plugin.name}" extractor "${e.id}" must declare extensions as a string array (e.g. [".xlsx"]).`,
          );
        }
        if (typeof e.extract !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" extractor "${e.id}" must provide extract(file).`,
          );
        }
        registerInMap(extractors, "extractor", e, plugin.name, extensions);
      },
      registerCleaner: (c) => {
        if (typeof c.clean !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" cleaner "${c.id}" must provide clean(document).`,
          );
        }
        registerInMap(cleaners, "cleaner", c, plugin.name, extensions);
      },
      registerPiiRule: (r) => {
        if (typeof r.find !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" pii-rule "${r.id}" must provide find(text).`,
          );
        }
        registerInMap(piiRules, "pii-rule", r, plugin.name, extensions);
      },
      registerGuardRule: (r) => {
        if (typeof r.find !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" guard-rule "${r.id}" must provide find(text).`,
          );
        }
        registerInMap(guardRules, "guard-rule", r, plugin.name, extensions);
      },
      registerCatalogSource: (s) => {
        if (typeof s.suggest !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" catalog-source "${s.id}" must provide suggest(input).`,
          );
        }
        registerInMap(catalogSources, "catalog-source", s, plugin.name, extensions);
      },
      registerMcpTool: (t) => {
        if (typeof t.description !== "string" || t.description.trim() === "") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-tool "${t.id}" must provide a non-empty description.`,
          );
        }
        if (typeof t.inputSchema !== "object" || t.inputSchema === null || Array.isArray(t.inputSchema)) {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-tool "${t.id}" must provide inputSchema as a JSON Schema object.`,
          );
        }
        if (typeof t.handler !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-tool "${t.id}" must provide handler(args, ctx).`,
          );
        }
        registerInMap(mcpTools, "mcp-tool", t, plugin.name, extensions);
      },
      registerMcpPrompt: (p) => {
        if (typeof p.description !== "string" || p.description.trim() === "") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-prompt "${p.id}" must provide a non-empty description.`,
          );
        }
        if (typeof p.template !== "string" || p.template.trim() === "") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-prompt "${p.id}" must provide a non-empty template.`,
          );
        }
        registerInMap(mcpPrompts, "mcp-prompt", p, plugin.name, extensions);
      },
      registerMcpAuthProvider: (provider) => {
        if (typeof provider.id !== "string" || provider.id.trim() === "") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-auth provider must have a non-empty id.`,
          );
        }
        if (typeof provider.authenticate !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-auth "${provider.id}" must provide authenticate().`,
          );
        }
        if (typeof provider.authorizeTool !== "function" || typeof provider.authorizeResource !== "function") {
          throw new ConfigError(
            `Plugin "${plugin.name}" mcp-auth "${provider.id}" must provide authorizeTool and authorizeResource.`,
          );
        }
        if (mcpAuthProvider) {
          throw new ConfigError(
            `Duplicate mcp-auth provider (already have "${mcpAuthProvider.id}", ` +
              `plugin "${plugin.name}" tried to register "${provider.id}"). ` +
              `List only one auth plugin under plugins:.`,
          );
        }
        mcpAuthProvider = provider;
        extensions.push({ point: "mcp-auth", id: provider.id });
      },
      getPluginSettings: () =>
        Object.hasOwn(pluginSettings, plugin.name) ? pluginSettings[plugin.name] : undefined,
    };

    plugin.register(api);
    loaded.push({ name: plugin.name, version: plugin.version, extensions });
  }

  return {
    connectors,
    extractors,
    cleaners,
    piiRules,
    guardRules,
    catalogSources,
    mcpTools,
    mcpPrompts,
    get mcpAuthProvider() {
      return mcpAuthProvider;
    },
    loaded,
    getConnector: (type) => connectors.get(type),
    listConnectorIds: () => [...connectors.keys()].sort(),
    registerPlugin,
  };
}

export interface LoadPluginsOptions {
  /** Always loaded first (e.g. built-in fs connector). */
  builtins?: KnotSyncPlugin[];
  /** Entries from config `plugins:` (paths or package names). */
  entries?: string[];
  /** Config directory; relative plugin paths resolve from here. */
  baseDir: string;
  /** Opaque top-level plugin settings keyed by plugin name. */
  pluginSettings?: Record<string, unknown>;
  /** Override import for tests. */
  importModule?: (specifier: string) => Promise<unknown>;
}

/**
 * Load built-in plugins then each listed entry via dynamic import.
 * Only listed entries are loaded; nothing is auto-discovered.
 */
export async function loadPlugins(options: LoadPluginsOptions): Promise<PluginHost> {
  const host = createPluginHost({ pluginSettings: options.pluginSettings });
  const importer =
    options.importModule ??
    (async (specifier: string) => {
      const mod = await import(specifier);
      return (mod as { default?: unknown }).default ?? mod;
    });

  for (const builtin of options.builtins ?? []) {
    host.registerPlugin(builtin);
  }

  for (const entry of options.entries ?? []) {
    const specifier = resolvePluginSpecifier(entry, options.baseDir);
    let exported: unknown;
    try {
      exported = await importer(specifier);
    } catch (err) {
      throw new ConfigError(
        `Could not load plugin "${entry}": ${(err as Error).message}\n` +
          `Check the path or package name in plugins:, and that the file exists.`,
      );
    }
    const plugin = assertPluginShape(exported, `"${entry}"`);
    host.registerPlugin(plugin);
  }

  return host;
}
