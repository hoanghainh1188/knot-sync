import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  createPluginHost,
  type SqlSourceConfig,
} from "@hoanghainh/knot-sync-core";
import type { SqlDriver, TableMeta } from "./driver.js";
import { parseAllow, parseSqlSource, resolveEnvUrl } from "./parse.js";
import { quoteIdent } from "./quote.js";
import { buildSelectQuery } from "./query-build.js";
import { createSqlPlugin } from "./plugin.js";
import { scanSql, tableToFileEntry } from "./scan.js";
import { describeAllowedTable } from "./schema.js";
import { handleDescribeTable, handleQueryTable } from "./mcp-tools.js";
import { UNTRUSTED_SQL_BANNER } from "./sql-frame.js";

function mockDriver(tables: Record<string, TableMeta>, rows: Record<string, unknown>[] = []): SqlDriver {
  const queries: { text: string; values: unknown[] }[] = [];
  return {
    dialect: "postgres",
    enableReadOnly: async () => undefined,
    introspectTable: async (name) => tables[name] ?? null,
    query: async (text, values) => {
      queries.push({ text, values });
      return rows;
    },
    close: async () => undefined,
    // test helper
    ...({ _queries: queries } as object),
  } as SqlDriver & { _queries: { text: string; values: unknown[] }[] };
}

test("resolveEnvUrl requires env:NAME and reads process.env", () => {
  assert.throws(() => resolveEnvUrl("postgres://x", 0), /env:VAR_NAME/);
  const key = "KNOT_TEST_PG_URL_" + String(process.pid);
  delete process.env[key];
  assert.throws(() => resolveEnvUrl(`env:${key}`, 0), new RegExp(key));
  process.env[key] = "postgres://localhost/db";
  try {
    const r = resolveEnvUrl(`env:${key}`, 0);
    assert.equal(r.urlEnv, key);
    assert.equal(r.url, "postgres://localhost/db");
  } finally {
    delete process.env[key];
  }
});

test("parseAllow rejects empty allow and accepts JP/VN tables", () => {
  assert.throws(() => parseAllow({}, 0), /at least one table/);
  const allow = parseAllow(
    { 受注: { columns: ["受注番号", "金額"] }, hoa_don: { columns: ["ma_kh"] } },
    0,
  );
  assert.deepEqual(allow["受注"]?.columns, ["受注番号", "金額"]);
  assert.deepEqual(allow.hoa_don?.columns, ["ma_kh"]);
});

test("quoteIdent handles Japanese names for postgres and mysql", () => {
  assert.equal(quoteIdent("受注", "postgres"), `"受注"`);
  assert.equal(quoteIdent("hoa_don", "mysql"), "`hoa_don`");
  assert.equal(quoteIdent('a"b', "postgres"), `"a""b"`);
});

test("buildSelectQuery uses parameters and rejects unknown columns", () => {
  const allowed = new Set(["得意先名", "金額"]);
  const q = buildSelectQuery({
    dialect: "postgres",
    table: "受注",
    selectColumns: ["得意先名", "金額"],
    allowedColumns: allowed,
    filters: [{ op: "eq", column: "得意先名", value: "株式会社サンプル" }],
    limit: 10,
  });
  assert.match(q.text, /SELECT .+ FROM "受注"/);
  assert.match(q.text, /"得意先名" = \$1/);
  assert.match(q.text, /LIMIT \$2/);
  assert.deepEqual(q.values, ["株式会社サンプル", 10]);
  assert.doesNotMatch(q.text, /株式会社サンプル/);

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "受注",
        selectColumns: ["得意先名"],
        allowedColumns: allowed,
        filters: [{ op: "eq", column: "secret", value: 1 }],
      }),
    /not allow-listed/,
  );
});

test("scanSql yields FileEntry for allow-listed tables with row estimates", async () => {
  const source: SqlSourceConfig = {
    id: "erp",
    type: "postgres",
    url: "postgres://mock",
    urlEnv: "X",
    allow: { 請求書: { columns: ["id"] }, missing: { columns: ["id"] } },
  };
  const driver = mockDriver({
    請求書: {
      name: "請求書",
      columns: [{ name: "id", dataType: "integer", isNullable: false, isPrimaryKey: true }],
      rowEstimate: 42,
    },
  });
  const issues: { path: string }[] = [];
  const entries = [];
  for await (const e of scanSql(source, { onIssue: (i) => issues.push(i) }, async () => driver)) {
    entries.push(e);
  }
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.relPath, "請求書");
  assert.equal(entries[0]?.type, "db_row");
  assert.equal(entries[0]?.size, 42);
  assert.equal(entries[0]?.hash, null);
  assert.ok(issues.some((i) => i.path === "missing"));
});

test("tableToFileEntry uses sql:// absPath", () => {
  const e = tableToFileEntry(
    {
      id: "erp",
      type: "mysql",
      url: "x",
      urlEnv: "Y",
      allow: { t: { columns: ["a"] } },
    },
    "t",
    3,
  );
  assert.equal(e.absPath, "sql://erp/t");
});

test("createSqlPlugin registers postgres/mysql connectors and mcp tools", () => {
  const host = createPluginHost();
  host.registerPlugin(createSqlPlugin());
  assert.ok(host.getConnector("postgres"));
  assert.ok(host.getConnector("mysql"));
  assert.ok(host.mcpTools.has("describe_table"));
  assert.ok(host.mcpTools.has("query_table"));
});

test("parseSqlSource wires env url", () => {
  const key = "KNOT_PARSE_SQL_" + String(process.pid);
  process.env[key] = "postgres://localhost/app";
  try {
    const src = parseSqlSource(
      {
        id: "erp",
        type: "postgres",
        url: `env:${key}`,
        allow: { 受注: { columns: ["id"] } },
      },
      { baseDir: "/", index: 0 },
      "postgres",
    );
    assert.equal(src.url, "postgres://localhost/app");
    assert.equal(src.urlEnv, key);
  } finally {
    delete process.env[key];
  }
  assert.throws(
    () =>
      parseSqlSource(
        { id: "erp", type: "postgres", url: "postgres://x", allow: { t: { columns: ["a"] } } },
        { baseDir: "/", index: 0 },
        "postgres",
      ),
    (err: unknown) => err instanceof ConfigError,
  );
});

test("describe and query handlers frame untrusted content", async () => {
  const source: SqlSourceConfig = {
    id: "erp",
    type: "postgres",
    url: "postgres://mock",
    urlEnv: "X",
    allow: { 受注: { columns: ["得意先名", "金額"] } },
  };
  const driver = mockDriver(
    {
      受注: {
        name: "受注",
        columns: [
          { name: "得意先名", dataType: "text", isNullable: false, isPrimaryKey: false },
          { name: "金額", dataType: "numeric", isNullable: false, isPrimaryKey: false },
          { name: "secret", dataType: "text", isNullable: true, isPrimaryKey: false },
        ],
        rowEstimate: 1,
      },
    },
    [{ 得意先名: "A社", 金額: 100 }],
  );
  const factory = async () => driver;
  const schema = await describeAllowedTable(source, "受注", factory);
  assert.equal(schema.columns.length, 2);
  assert.ok(!schema.columns.some((c) => c.name === "secret"));

  const config = {
    baseDir: "/",
    sources: [source],
    store: { path: "/tmp/s.sqlite" },
    scan: { oldFileYears: 5, hash: true },
    cleaning: {
      nfkc: true,
      wareki: true,
      datesIso: true,
      legacyVietnamese: true,
      tokenReduce: true,
    },
    pii: { mode: "mask" as const, saltPath: "/tmp/salt" },
    guard: { mode: "flag" as const },
    server: { auditLog: "/tmp/a.jsonl" },
    prompts: [],
    plugins: [],
    pluginSettings: {},
  };
  const ctx = { config, sqlDriverFactories: { erp: factory } };
  const described = await handleDescribeTable({ source: "erp", table: "受注" }, ctx);
  assert.match(described.content, new RegExp(UNTRUSTED_SQL_BANNER.slice(0, 20)));
  const queried = await handleQueryTable(
    { source: "erp", table: "受注", filters: [{ op: "eq", column: "得意先名", value: "A社" }] },
    ctx,
  );
  assert.match(queried.content, /UNTRUSTED_DOCUMENT_CONTENT/);
  assert.match(queried.content, /A社/);
  assert.equal(queried.meta?.resultCount, 1);
});
