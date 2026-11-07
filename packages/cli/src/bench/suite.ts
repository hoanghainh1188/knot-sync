import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse } from "yaml";

export const DEFAULT_BENCH_SUITE_FILE = "knot-sync.bench.yaml";

export class BenchSuiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchSuiteError";
  }
}

export interface SearchExpect {
  documentId?: string;
  titleContains?: string;
  pathContains?: string;
}

export interface SearchCase {
  id: string;
  query: string;
  expect: SearchExpect;
}

export interface CatalogCase {
  id: string;
  source: string;
  table: string;
  name: string;
  /** When true (default), after-catalog resolve must succeed. */
  expectResolved: boolean;
}

export interface BenchSuite {
  version: 1;
  search: SearchCase[];
  catalog: CatalogCase[];
  /** Absolute path the suite was loaded from. */
  path: string;
}

/** Default suite path: same directory as the config file. */
export function defaultSuitePath(configPath: string): string {
  return join(dirname(configPath), DEFAULT_BENCH_SUITE_FILE);
}

function asObject(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new BenchSuiteError(`${path} must be an object.`);
  }
  return raw as Record<string, unknown>;
}

function asString(raw: unknown, path: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new BenchSuiteError(`${path} must be a non-empty string.`);
  }
  return raw;
}

function asOptionalString(raw: unknown, path: string): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  return asString(raw, path);
}

function asBool(raw: unknown, path: string, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "boolean") {
    throw new BenchSuiteError(`${path} must be a boolean.`);
  }
  return raw;
}

function parseSearchExpect(raw: unknown, path: string): SearchExpect {
  const o = asObject(raw, path);
  const documentId = asOptionalString(o.documentId, `${path}.documentId`);
  const titleContains = asOptionalString(o.titleContains, `${path}.titleContains`);
  const pathContains = asOptionalString(o.pathContains, `${path}.pathContains`);
  if (!documentId && !titleContains && !pathContains) {
    throw new BenchSuiteError(
      `${path} needs at least one of documentId, titleContains, or pathContains.`,
    );
  }
  for (const k of Object.keys(o)) {
    if (k !== "documentId" && k !== "titleContains" && k !== "pathContains") {
      throw new BenchSuiteError(
        `${path} has unknown key "${k}" (allowed: documentId, titleContains, pathContains).`,
      );
    }
  }
  return { documentId, titleContains, pathContains };
}

function parseSearchCase(raw: unknown, path: string): SearchCase {
  const o = asObject(raw, path);
  for (const k of Object.keys(o)) {
    if (k !== "id" && k !== "query" && k !== "expect") {
      throw new BenchSuiteError(`${path} has unknown key "${k}".`);
    }
  }
  return {
    id: asString(o.id, `${path}.id`),
    query: asString(o.query, `${path}.query`),
    expect: parseSearchExpect(o.expect, `${path}.expect`),
  };
}

function parseCatalogCase(raw: unknown, path: string): CatalogCase {
  const o = asObject(raw, path);
  for (const k of Object.keys(o)) {
    if (k !== "id" && k !== "source" && k !== "table" && k !== "name" && k !== "expectResolved") {
      throw new BenchSuiteError(`${path} has unknown key "${k}".`);
    }
  }
  return {
    id: asString(o.id, `${path}.id`),
    source: asString(o.source, `${path}.source`),
    table: asString(o.table, `${path}.table`),
    name: asString(o.name, `${path}.name`),
    expectResolved: asBool(o.expectResolved, `${path}.expectResolved`, true),
  };
}

function parseSuiteDocument(raw: unknown, absolutePath: string): BenchSuite {
  const o = asObject(raw, "suite");
  if (o.version !== 1) {
    throw new BenchSuiteError(
      `Suite version must be 1 (got ${JSON.stringify(o.version)}). Fix ${absolutePath}.`,
    );
  }
  for (const k of Object.keys(o)) {
    if (k !== "version" && k !== "search" && k !== "catalog") {
      throw new BenchSuiteError(`Suite has unknown key "${k}" in ${absolutePath}.`);
    }
  }

  const searchRaw = o.search === undefined || o.search === null ? [] : o.search;
  if (!Array.isArray(searchRaw)) {
    throw new BenchSuiteError(`suite.search must be a list in ${absolutePath}.`);
  }
  const catalogRaw = o.catalog === undefined || o.catalog === null ? [] : o.catalog;
  if (!Array.isArray(catalogRaw)) {
    throw new BenchSuiteError(`suite.catalog must be a list in ${absolutePath}.`);
  }

  return {
    version: 1,
    search: searchRaw.map((c, i) => parseSearchCase(c, `suite.search[${i}]`)),
    catalog: catalogRaw.map((c, i) => parseCatalogCase(c, `suite.catalog[${i}]`)),
    path: absolutePath,
  };
}

/**
 * Load a bench suite YAML file. Throws {@link BenchSuiteError} with an
 * actionable message when the file is missing or invalid.
 */
export async function loadBenchSuite(absolutePath: string): Promise<BenchSuite> {
  let text: string;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new BenchSuiteError(
        `Bench suite not found at ${absolutePath}. Create ${DEFAULT_BENCH_SUITE_FILE} beside the config, or pass --suite <path>.`,
      );
    }
    throw new BenchSuiteError(
      `Cannot read bench suite ${absolutePath}: ${(err as Error).message}`,
    );
  }

  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new BenchSuiteError(
      `Invalid YAML in ${absolutePath}: ${(err as Error).message}. Fix the suite file and re-run bench.`,
    );
  }
  return parseSuiteDocument(raw, absolutePath);
}

/** Load suite when present; return null when the default path does not exist. */
export async function loadBenchSuiteIfPresent(
  absolutePath: string,
): Promise<BenchSuite | null> {
  try {
    await access(absolutePath);
  } catch {
    return null;
  }
  return loadBenchSuite(absolutePath);
}
