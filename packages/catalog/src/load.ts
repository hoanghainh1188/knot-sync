import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";
import {
  emptyCatalog,
  emptyColumn,
  emptyLabel,
  emptyTable,
  type CatalogColumn,
  type CatalogDocument,
  type CatalogLabel,
  type CatalogSourceEntry,
  type CatalogTable,
} from "./types.js";

export const DEFAULT_CATALOG_FILE = "knot-sync.catalog.yaml";

export class CatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogError";
  }
}

function asLabel(raw: unknown, path: string): CatalogLabel {
  if (raw === undefined || raw === null) return emptyLabel();
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new CatalogError(`${path}.label must be an object with ja/vi/en strings.`);
  }
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k !== "ja" && k !== "vi" && k !== "en") {
      throw new CatalogError(`${path}.label has unknown key "${k}" (allowed: ja, vi, en).`);
    }
  }
  const ja = o.ja === undefined ? "" : o.ja;
  const vi = o.vi === undefined ? "" : o.vi;
  const en = o.en === undefined ? "" : o.en;
  if (typeof ja !== "string" || typeof vi !== "string" || typeof en !== "string") {
    throw new CatalogError(`${path}.label ja/vi/en must be strings.`);
  }
  return { ja, vi, en };
}

function asStringArray(raw: unknown, path: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
    throw new CatalogError(`${path} must be a list of strings.`);
  }
  return raw as string[];
}

function asBool(raw: unknown, path: string, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "boolean") {
    throw new CatalogError(`${path} must be a boolean.`);
  }
  return raw;
}

function asString(raw: unknown, path: string, fallback = ""): string {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "string") {
    throw new CatalogError(`${path} must be a string.`);
  }
  return raw;
}

function parseColumn(raw: unknown, path: string): CatalogColumn {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CatalogError(`${path} must be an object.`);
  }
  const o = raw as Record<string, unknown>;
  const allowed = new Set([
    "label",
    "description",
    "type",
    "values",
    "references",
    "pii",
    "expose",
    "reviewed",
  ]);
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) {
      throw new CatalogError(
        `${path} has unknown key "${k}". Allowed: ${[...allowed].join(", ")}.`,
      );
    }
  }
  const references = asString(o.references, `${path}.references`).trim();
  return emptyColumn({
    label: asLabel(o.label, path),
    description: asString(o.description, `${path}.description`),
    type: asString(o.type, `${path}.type`),
    values: asStringArray(o.values, `${path}.values`),
    ...(references !== "" ? { references } : {}),
    pii: asBool(o.pii, `${path}.pii`, false),
    expose: asBool(o.expose, `${path}.expose`, true),
    reviewed: asBool(o.reviewed, `${path}.reviewed`, false),
  });
}

function parseTable(raw: unknown, path: string): CatalogTable {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CatalogError(`${path} must be an object.`);
  }
  const o = raw as Record<string, unknown>;
  const allowed = new Set(["label", "description", "reviewed", "columns"]);
  for (const k of Object.keys(o)) {
    if (!allowed.has(k)) {
      throw new CatalogError(
        `${path} has unknown key "${k}". Allowed: ${[...allowed].join(", ")}.`,
      );
    }
  }
  const columnsRaw = o.columns ?? {};
  if (typeof columnsRaw !== "object" || columnsRaw === null || Array.isArray(columnsRaw)) {
    throw new CatalogError(`${path}.columns must be an object keyed by physical column name.`);
  }
  const columns: Record<string, CatalogColumn> = {};
  for (const [name, col] of Object.entries(columnsRaw as Record<string, unknown>)) {
    columns[name] = parseColumn(col, `${path}.columns.${name}`);
  }
  return emptyTable({
    label: asLabel(o.label, path),
    description: asString(o.description, `${path}.description`),
    reviewed: asBool(o.reviewed, `${path}.reviewed`, false),
    columns,
  });
}

function parseSource(raw: unknown, path: string): CatalogSourceEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CatalogError(`${path} must be an object.`);
  }
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k !== "tables") {
      throw new CatalogError(`${path} has unknown key "${k}". Allowed: tables.`);
    }
  }
  const tablesRaw = o.tables ?? {};
  if (typeof tablesRaw !== "object" || tablesRaw === null || Array.isArray(tablesRaw)) {
    throw new CatalogError(`${path}.tables must be an object keyed by physical table name.`);
  }
  const tables: Record<string, CatalogTable> = {};
  for (const [name, table] of Object.entries(tablesRaw as Record<string, unknown>)) {
    tables[name] = parseTable(table, `${path}.tables.${name}`);
  }
  return { tables };
}

/** Parse and validate catalog YAML text. */
export function parseCatalogYaml(text: string): CatalogDocument {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new CatalogError(`Invalid catalog YAML: ${(err as Error).message}`);
  }
  if (raw === null || raw === undefined) {
    return emptyCatalog();
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new CatalogError("Catalog must be a YAML object.");
  }
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k !== "version" && k !== "sources") {
      throw new CatalogError(
        `Catalog has unknown key "${k}". Allowed: version, sources.`,
      );
    }
  }
  const version = o.version ?? 1;
  if (version !== 1) {
    throw new CatalogError(
      `Unsupported catalog version ${JSON.stringify(version)}. Only version 1 is supported.`,
    );
  }
  const sourcesRaw = o.sources ?? {};
  if (typeof sourcesRaw !== "object" || sourcesRaw === null || Array.isArray(sourcesRaw)) {
    throw new CatalogError('"sources" must be an object keyed by source id.');
  }
  const sources: Record<string, CatalogSourceEntry> = {};
  for (const [id, src] of Object.entries(sourcesRaw as Record<string, unknown>)) {
    sources[id] = parseSource(src, `sources.${id}`);
  }
  return { version: 1, sources };
}

/** Load catalog from disk; missing file returns empty catalog. */
export async function loadCatalogFile(path: string): Promise<CatalogDocument> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyCatalog();
    throw new CatalogError(
      `Cannot read catalog at ${path}: ${(err as Error).message}. Check the path or run "knot-sync describe".`,
    );
  }
  return parseCatalogYaml(text);
}

/** Serialize catalog to YAML text. */
export function stringifyCatalog(doc: CatalogDocument): string {
  return stringify(doc, { lineWidth: 0, defaultStringType: "PLAIN" });
}

/** Atomically write catalog YAML (temp file + rename). */
export async function writeCatalogFile(path: string, doc: CatalogDocument): Promise<void> {
  const text = stringifyCatalog(doc);
  const tmp = join(dirname(path), `.${Date.now()}.catalog.tmp`);
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
}

export function defaultCatalogPath(configDir: string): string {
  return join(configDir, DEFAULT_CATALOG_FILE);
}
