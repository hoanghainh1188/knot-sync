import {
  ConfigError,
  assertSourceId,
  type SqlAllowTable,
  type SqlSourceConfig,
} from "@hoanghainh/knot-sync-core";

const ENV_URL = /^env:([A-Za-z_][A-Za-z0-9_]*)$/;

export function resolveEnvUrl(rawUrl: unknown, index: number): { url: string; urlEnv: string } {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    throw new ConfigError(
      `sources[${index}].url is required as "env:VAR_NAME" (connection strings must not be stored in the config file).`,
    );
  }
  const m = ENV_URL.exec(rawUrl.trim());
  if (!m) {
    throw new ConfigError(
      `sources[${index}].url must be "env:VAR_NAME" (got ${JSON.stringify(rawUrl)}). ` +
        `Never put a plaintext database URL in the config file.`,
    );
  }
  const urlEnv = m[1]!;
  const url = process.env[urlEnv];
  if (typeof url !== "string" || url.trim() === "") {
    throw new ConfigError(
      `Environment variable "${urlEnv}" is missing or empty. ` +
        `Set it to the database URL for sources[${index}], then retry.`,
    );
  }
  return { url, urlEnv };
}

export function parseAllow(
  raw: unknown,
  index: number,
): Record<string, SqlAllowTable> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigError(
      `sources[${index}].allow must be an object mapping table names to { columns: [...] }.`,
    );
  }
  const allow: Record<string, SqlAllowTable> = Object.create(null);
  for (const [table, spec] of Object.entries(raw as Record<string, unknown>)) {
    if (table.trim() === "") {
      throw new ConfigError(`sources[${index}].allow has an empty table name.`);
    }
    if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
      throw new ConfigError(
        `sources[${index}].allow["${table}"] must be an object with a columns list.`,
      );
    }
    const cols = (spec as Record<string, unknown>).columns;
    if (!Array.isArray(cols) || cols.length === 0 || cols.some((c) => typeof c !== "string" || c.trim() === "")) {
      throw new ConfigError(
        `sources[${index}].allow["${table}"].columns must be a non-empty list of non-empty strings.`,
      );
    }
    allow[table] = { columns: cols as string[] };
  }
  if (Object.keys(allow).length === 0) {
    throw new ConfigError(
      `sources[${index}].allow must list at least one table. An empty allow-list is not permitted.`,
    );
  }
  return allow;
}

export function parseSqlSource(
  raw: Record<string, unknown>,
  ctx: { baseDir: string; index: number },
  expectedType: "postgres" | "mysql",
): SqlSourceConfig {
  const id = assertSourceId(raw.id, ctx.index);
  if (raw.type !== expectedType) {
    throw new ConfigError(
      `sources[${ctx.index}].type must be "${expectedType}" (got ${JSON.stringify(raw.type)}).`,
    );
  }
  const { url, urlEnv } = resolveEnvUrl(raw.url, ctx.index);
  const allow = parseAllow(raw.allow, ctx.index);
  return { id, type: expectedType, url, urlEnv, allow };
}
