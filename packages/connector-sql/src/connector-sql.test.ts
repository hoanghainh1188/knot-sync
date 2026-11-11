import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  createPluginHost,
  type SqlSourceConfig,
} from "@hoanghainh/knot-sync-core";
import {
  DEFAULT_POOL_MAX,
  DEFAULT_POSTGRES_SCHEMA,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  type SqlDriver,
  type TableMeta,
} from "./driver.js";
import { parseAllow, parseSqlSource, resolveEnvUrl } from "./parse.js";
import { quoteIdent } from "./quote.js";
import { buildSelectQuery, quoteTableRef } from "./query-build.js";
import { createSqlPlugin } from "./plugin.js";
import {
  createSqlMcpToolsPlugin,
  handleDescribeTable,
  handleQueryTable,
} from "./mcp-tools.js";
import {
  driverOptionsFromSource,
  effectiveSchema,
  scanSql,
  tableToFileEntry,
} from "./scan.js";
import { describeAllowedTable } from "./schema.js";
import { postgresStatementTimeoutSql } from "./postgres.js";
import { mysqlMaxExecutionTimeSql } from "./mysql.js";
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

test("quoteIdent and buildSelectQuery cover enterprise dialects", () => {
  assert.equal(quoteIdent("請求", "mssql"), "[請求]");
  assert.equal(quoteIdent("a]b", "access"), "[a]]b]");
  assert.equal(quoteIdent("受注", "oracle"), `"受注"`);
  assert.equal(quoteIdent("hoa_don", "as400"), `"hoa_don"`);

  const allowed = new Set(["金額", "ten_kh"]);
  const mssql = buildSelectQuery({
    dialect: "mssql",
    table: "請求",
    selectColumns: ["金額"],
    allowedColumns: allowed,
    filters: [{ op: "eq", column: "金額", value: 100 }],
    limit: 10,
  });
  assert.match(mssql.text, /SELECT TOP 10 \[金額\] FROM \[請求\]/);
  assert.match(mssql.text, /\[金額\] = \?/);
  assert.deepEqual(mssql.values, [100]);

  const oracle = buildSelectQuery({
    dialect: "oracle",
    table: "受注",
    selectColumns: ["ten_kh"],
    allowedColumns: allowed,
    filters: [{ op: "eq", column: "ten_kh", value: "Nguyễn" }],
    limit: 5,
  });
  assert.match(oracle.text, /FETCH FIRST :2 ROWS ONLY/);
  assert.match(oracle.text, /"ten_kh" = :1/);
  assert.deepEqual(oracle.values, ["Nguyễn", 5]);

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "oracle",
        table: "受注",
        selectColumns: ["ten_kh"],
        allowedColumns: allowed,
        filters: [{ op: "eq", column: "SALARY", value: 1 }],
      }),
    /not allow-listed/,
  );
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

test("query_table tool schema documents new filter operators", () => {
  const host = createPluginHost();
  host.registerPlugin(createSqlMcpToolsPlugin());
  const tool = host.mcpTools.get("query_table");
  assert.ok(tool);
  assert.match(tool.description, /starts_with/);
  assert.match(tool.description, /between_dates/);
  assert.match(tool.description, /is_null/);
  const filters = (tool.inputSchema as { properties?: { filters?: { description?: string } } })
    .properties?.filters;
  assert.match(String(filters?.description ?? ""), /starts_with/);
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
    assert.equal(src.schema, undefined);
    assert.equal(src.statementTimeoutMs, undefined);
    assert.equal(effectiveSchema(src), DEFAULT_POSTGRES_SCHEMA);
    assert.equal(driverOptionsFromSource(src).statementTimeoutMs, DEFAULT_STATEMENT_TIMEOUT_MS);
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

test("parseSqlSource accepts Japanese schema and statementTimeoutMs", () => {
  const key = "KNOT_PARSE_SQL_SCHEMA_" + String(process.pid);
  process.env[key] = "postgres://localhost/app";
  try {
    const src = parseSqlSource(
      {
        id: "erp",
        type: "postgres",
        url: `env:${key}`,
        schema: "経理",
        statementTimeoutMs: 8000,
        allow: { 請求: { columns: ["id"] } },
      },
      { baseDir: "/", index: 0 },
      "postgres",
    );
    assert.equal(src.schema, "経理");
    assert.equal(src.statementTimeoutMs, 8000);
    assert.equal(effectiveSchema(src), "経理");
    assert.deepEqual(driverOptionsFromSource(src), {
      schema: "経理",
      statementTimeoutMs: 8000,
    });
  } finally {
    delete process.env[key];
  }
});

test("parseSqlSource rejects empty schema, mysql schema, and bad timeout", () => {
  const key = "KNOT_PARSE_SQL_BAD_" + String(process.pid);
  process.env[key] = "postgres://localhost/app";
  try {
    assert.throws(
      () =>
        parseSqlSource(
          {
            id: "erp",
            type: "postgres",
            url: `env:${key}`,
            schema: "  ",
            allow: { t: { columns: ["a"] } },
          },
          { baseDir: "/", index: 0 },
          "postgres",
        ),
      /schema must be a non-empty/,
    );
    assert.throws(
      () =>
        parseSqlSource(
          {
            id: "erp",
            type: "mysql",
            url: `env:${key}`,
            schema: "anything",
            allow: { t: { columns: ["a"] } },
          },
          { baseDir: "/", index: 0 },
          "mysql",
        ),
      /schema is only allowed for type "postgres"/,
    );
    assert.throws(
      () =>
        parseSqlSource(
          {
            id: "erp",
            type: "postgres",
            url: `env:${key}`,
            statementTimeoutMs: 0,
            allow: { t: { columns: ["a"] } },
          },
          { baseDir: "/", index: 0 },
          "postgres",
        ),
      /statementTimeoutMs must be a positive integer/,
    );
  } finally {
    delete process.env[key];
  }
});

test("pool and timeout helpers expose documented defaults", () => {
  assert.equal(DEFAULT_POOL_MAX, 4);
  assert.equal(DEFAULT_STATEMENT_TIMEOUT_MS, 5000);
  assert.equal(postgresStatementTimeoutSql(5000), "SET statement_timeout = 5000");
  assert.equal(mysqlMaxExecutionTimeSql(5000), "SET SESSION MAX_EXECUTION_TIME = 5000");
  assert.equal(quoteTableRef("請求", "postgres", "経理"), `"経理"."請求"`);
  assert.equal(quoteTableRef("hoa_don", "mysql"), "`hoa_don`");
});

test("buildSelectQuery supports starts_with, between_dates, and is_null", () => {
  const allowed = new Set(["ten_kh", "計上日", "memo"]);
  const prefix = buildSelectQuery({
    dialect: "postgres",
    table: "khach",
    selectColumns: ["ten_kh"],
    allowedColumns: allowed,
    schema: "public",
    filters: [{ op: "starts_with", column: "ten_kh", value: "Nguyễn" }],
    limit: 5,
  });
  assert.match(prefix.text, /FROM "public"\."khach"/);
  assert.match(prefix.text, /"ten_kh" LIKE \$1 ESCAPE '\\'/);
  assert.deepEqual(prefix.values, ["Nguyễn%", 5]);
  assert.doesNotMatch(prefix.text, /Nguyễn/);

  const dates = buildSelectQuery({
    dialect: "postgres",
    table: "受注",
    selectColumns: ["計上日"],
    allowedColumns: allowed,
    filters: [{ op: "between_dates", column: "計上日", from: "2024-01-01", to: "2024-12-31" }],
    limit: 10,
  });
  assert.match(dates.text, /"計上日" >= \$1/);
  assert.match(dates.text, /"計上日" <= \$2/);
  assert.deepEqual(dates.values, ["2024-01-01", "2024-12-31", 10]);

  const nulls = buildSelectQuery({
    dialect: "postgres",
    table: "受注",
    selectColumns: ["memo"],
    allowedColumns: allowed,
    filters: [{ op: "is_null", column: "memo", value: true }],
  });
  assert.match(nulls.text, /"memo" IS NULL/);
  const notNull = buildSelectQuery({
    dialect: "postgres",
    table: "受注",
    selectColumns: ["memo"],
    allowedColumns: allowed,
    filters: [{ op: "is_null", column: "memo", value: false }],
  });
  assert.match(notNull.text, /"memo" IS NOT NULL/);

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "受注",
        selectColumns: ["ten_kh"],
        allowedColumns: allowed,
        filters: [{ op: "starts_with", column: "secret", value: "x" }],
      }),
    /not allow-listed/,
  );
  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "受注",
        selectColumns: ["計上日"],
        allowedColumns: allowed,
        filters: [{ op: "between_dates", column: "計上日", from: "nope", to: "2024-01-01" }],
      }),
    /ISO date/,
  );
  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "受注",
        selectColumns: ["計上日"],
        allowedColumns: allowed,
        filters: [
          { op: "between_dates", column: "計上日", from: "2024-12-31", to: "2024-01-01" },
        ],
      }),
    /from" <= "to/,
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
    extraction: { maxFileSizeMb: 50, timeoutSeconds: 30, maxTextChars: 500_000 },
    pii: { mode: "mask" as const, saltPath: "/tmp/salt" },
    guard: { mode: "flag" as const },
    server: { auditLog: "/tmp/a.jsonl" },
    logging: { path: "/tmp/system.jsonl", level: "info" as const },
    catalog: {
      path: "/tmp/knot-sync.catalog.yaml",
      definitionMapping: {
        physical: "物理名",
        label_ja: "論理名",
        label_vi: "Tên nghiệp vụ",
        label_en: "Business name",
        description: "説明",
        sheet: "項目",
      },
    },
    prompts: [],
    cli: {},
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

test("query_table resolves catalog business labels and validates enums", async () => {
  const source: SqlSourceConfig = {
    id: "erp",
    type: "postgres",
    url: "postgres://mock",
    urlEnv: "X",
    allow: { 受注: { columns: ["TKSK_CD", "KBN"] } },
  };
  const driver = mockDriver(
    {
      受注: {
        name: "受注",
        columns: [
          { name: "TKSK_CD", dataType: "text", isNullable: false, isPrimaryKey: false },
          { name: "KBN", dataType: "text", isNullable: false, isPrimaryKey: false },
        ],
        rowEstimate: 1,
      },
    },
    [{ TKSK_CD: "001", KBN: "A" }],
  );
  const factory = async () => driver;
  const catalog = {
    version: 1 as const,
    sources: {
      erp: {
        tables: {
          受注: {
            label: { ja: "受注", vi: "", en: "" },
            description: "",
            reviewed: false,
            columns: {
              TKSK_CD: {
                label: { ja: "得意先コード", vi: "", en: "" },
                description: "",
                type: "text",
                values: [],
                pii: false,
                expose: true,
                reviewed: false,
              },
              KBN: {
                label: { ja: "区分", vi: "", en: "" },
                description: "",
                type: "text",
                values: ["A", "B"],
                pii: false,
                expose: true,
                reviewed: false,
              },
            },
          },
        },
      },
    },
  };
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
    extraction: { maxFileSizeMb: 50, timeoutSeconds: 30, maxTextChars: 500_000 },
    pii: { mode: "mask" as const, saltPath: "/tmp/salt" },
    guard: { mode: "flag" as const },
    server: { auditLog: "/tmp/a.jsonl" },
    logging: { path: "/tmp/system.jsonl", level: "info" as const },
    catalog: {
      path: "/tmp/knot-sync.catalog.yaml",
      definitionMapping: {
        physical: "物理名",
        label_ja: "論理名",
        label_vi: "Tên nghiệp vụ",
        label_en: "Business name",
        description: "説明",
        sheet: "項目",
      },
    },
    prompts: [],
    cli: {},
    plugins: [],
    pluginSettings: {},
  };
  const ctx = { config, catalog, sqlDriverFactories: { erp: factory } };
  const described = await handleDescribeTable({ source: "erp", table: "受注" }, ctx);
  assert.match(described.content, /得意先コード/);
  const ok = await handleQueryTable(
    {
      source: "erp",
      table: "受注",
      filters: [{ op: "eq", column: "得意先コード", value: "001" }],
    },
    ctx,
  );
  assert.equal(ok.meta?.resultCount, 1);
  await assert.rejects(
    () =>
      handleQueryTable(
        { source: "erp", table: "受注", filters: [{ op: "eq", column: "KBN", value: "Z" }] },
        ctx,
      ),
    /valid values|Allowed/,
  );
});

test("buildSelectQuery supports orderBy, groupBy, and aggregations across dialects", () => {
  const allowed = new Set(["trang_thai", "so_tien", "顧客名", "金額"]);

  const pgSorted = buildSelectQuery({
    dialect: "postgres",
    table: "受注",
    selectColumns: ["顧客名", "金額"],
    allowedColumns: allowed,
    filters: [{ op: "eq", column: "顧客名", value: "A社" }],
    orderBy: [{ column: "金額", dir: "desc" }, { column: "顧客名" }],
    limit: 5,
  });
  assert.equal(
    pgSorted.text,
    'SELECT "顧客名", "金額" FROM "受注" WHERE "顧客名" = $1 ORDER BY "金額" DESC, "顧客名" ASC LIMIT $2',
  );
  assert.deepEqual(pgSorted.values, ["A社", 5]);

  const vnAgg = buildSelectQuery({
    dialect: "postgres",
    table: "hoa_don",
    selectColumns: ["trang_thai", "so_tien"],
    allowedColumns: allowed,
    groupBy: ["trang_thai"],
    aggregations: [
      { func: "count", column: "*", as: "total_count" },
      { func: "sum", column: "so_tien", as: "total_amount" },
      { func: "avg", column: "so_tien" },
      { func: "min", column: "金額" },
      { func: "max", column: "金額" },
    ],
    orderBy: [{ column: "total_amount", dir: "desc" }],
    limit: 10,
  });
  assert.equal(
    vnAgg.text,
    'SELECT "trang_thai", COUNT(*) AS "total_count", SUM("so_tien") AS "total_amount", ' +
      'AVG("so_tien") AS "avg_so_tien", MIN("金額") AS "min_col", MAX("金額") AS "max_col" ' +
      'FROM "hoa_don" GROUP BY "trang_thai" ORDER BY "total_amount" DESC LIMIT $1',
  );
  assert.deepEqual(vnAgg.values, [10]);

  // Distinct grouping when groupBy is supplied without aggregations
  const distinctGroup = buildSelectQuery({
    dialect: "mysql",
    table: "hoa_don",
    selectColumns: ["trang_thai", "so_tien"],
    allowedColumns: allowed,
    groupBy: ["trang_thai"],
    orderBy: [{ column: "trang_thai", dir: "asc" }],
    limit: 20,
  });
  assert.equal(
    distinctGroup.text,
    "SELECT `trang_thai` FROM `hoa_don` GROUP BY `trang_thai` ORDER BY `trang_thai` ASC LIMIT ?",
  );
  assert.deepEqual(distinctGroup.values, [20]);

  // Dialect-specific limit/order placement
  const oracle = buildSelectQuery({
    dialect: "oracle",
    table: "受注",
    selectColumns: ["金額"],
    allowedColumns: allowed,
    orderBy: [{ column: "金額", dir: "asc" }],
    limit: 10,
  });
  assert.equal(
    oracle.text,
    'SELECT "金額" FROM "受注" ORDER BY "金額" ASC FETCH FIRST :1 ROWS ONLY',
  );
  assert.deepEqual(oracle.values, [10]);

  const mssql = buildSelectQuery({
    dialect: "mssql",
    table: "受注",
    selectColumns: ["金額"],
    allowedColumns: allowed,
    groupBy: ["顧客名"],
    aggregations: [{ func: "sum", column: "金額", as: "sum_amt" }],
    orderBy: [{ column: "sum_amt", dir: "desc" }],
    limit: 10,
  });
  assert.equal(
    mssql.text,
    "SELECT TOP 10 [顧客名], SUM([金額]) AS [sum_amt] FROM [受注] GROUP BY [顧客名] ORDER BY [sum_amt] DESC",
  );
  assert.deepEqual(mssql.values, []);
});

test("buildSelectQuery validates aggregation aliases, wildcard, and ungrouped orderBy", () => {
  const allowed = new Set(["trang_thai", "so_tien"]);

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "hoa_don",
        selectColumns: ["trang_thai", "so_tien"],
        allowedColumns: allowed,
        aggregations: [{ func: "sum", column: "*" }],
      }),
    /Wildcard "\*" is only supported for "count"/,
  );

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "hoa_don",
        selectColumns: ["trang_thai", "so_tien"],
        allowedColumns: allowed,
        aggregations: [{ func: "count", column: "*", as: "x; DROP TABLE t" }],
      }),
    /Invalid aggregation alias/,
  );

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "hoa_don",
        selectColumns: ["trang_thai", "so_tien"],
        allowedColumns: allowed,
        groupBy: ["trang_thai"],
        aggregations: [{ func: "count", column: "*", as: "trang_thai" }],
      }),
    /Duplicate output alias/,
  );

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "hoa_don",
        selectColumns: ["trang_thai", "so_tien"],
        allowedColumns: allowed,
        groupBy: ["trang_thai"],
        aggregations: [{ func: "count", column: "*", as: "cnt" }],
        orderBy: [{ column: "so_tien", dir: "desc" }],
      }),
    /grouped column or aggregation alias/,
  );

  assert.throws(
    () =>
      buildSelectQuery({
        dialect: "postgres",
        table: "hoa_don",
        selectColumns: ["trang_thai"],
        allowedColumns: allowed,
        orderBy: [{ column: "SALARY", dir: "desc" }],
      }),
    /not allow-listed/,
  );
});

test("query_table documents analytics schema and resolves JA/VI catalog labels", async () => {
  const host = createPluginHost();
  host.registerPlugin(createSqlMcpToolsPlugin());
  const tool = host.mcpTools.get("query_table");
  assert.ok(tool);
  assert.match(tool.description, /groupBy/);
  assert.match(tool.description, /aggregations/);
  assert.match(tool.description, /orderBy/);
  const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  assert.ok(props.groupBy);
  assert.ok(props.aggregations);
  assert.ok(props.orderBy);

  const source: SqlSourceConfig = {
    id: "erp",
    type: "postgres",
    url: "postgres://mock",
    urlEnv: "X",
    allow: { 受注: { columns: ["TKSK_CD", "KIN", "DUP_A", "DUP_B"] } },
  };
  const driver = mockDriver(
    {
      受注: {
        name: "受注",
        columns: [
          { name: "TKSK_CD", dataType: "text", isNullable: false, isPrimaryKey: false },
          { name: "KIN", dataType: "numeric", isNullable: false, isPrimaryKey: false },
          { name: "DUP_A", dataType: "text", isNullable: true, isPrimaryKey: false },
          { name: "DUP_B", dataType: "text", isNullable: true, isPrimaryKey: false },
        ],
        rowEstimate: 2,
      },
    },
    [{ TKSK_CD: "C01", sum_kin: 5000 }],
  ) as SqlDriver & { _queries: { text: string; values: unknown[] }[] };
  const catalog = {
    version: 1 as const,
    sources: {
      erp: {
        tables: {
          受注: {
            label: { ja: "受注", vi: "", en: "" },
            description: "",
            reviewed: false,
            columns: {
              TKSK_CD: {
                label: { ja: "得意先コード", vi: "", en: "" },
                description: "",
                type: "text",
                values: [],
                pii: false,
                expose: true,
                reviewed: false,
              },
              KIN: {
                label: { ja: "金額", vi: "Tổng tiền", en: "" },
                description: "",
                type: "numeric",
                values: [],
                pii: false,
                expose: true,
                reviewed: false,
              },
              DUP_A: {
                label: { ja: "重複ラベル", vi: "", en: "" },
                description: "",
                type: "text",
                values: [],
                pii: false,
                expose: true,
                reviewed: false,
              },
              DUP_B: {
                label: { ja: "重複ラベル", vi: "", en: "" },
                description: "",
                type: "text",
                values: [],
                pii: false,
                expose: true,
                reviewed: false,
              },
            },
          },
        },
      },
    },
  };
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
    extraction: { maxFileSizeMb: 50, timeoutSeconds: 30, maxTextChars: 500_000 },
    pii: { mode: "mask" as const, saltPath: "/tmp/salt" },
    guard: { mode: "flag" as const },
    server: { auditLog: "/tmp/a.jsonl" },
    logging: { path: "/tmp/system.jsonl", level: "info" as const },
    catalog: {
      path: "/tmp/knot-sync.catalog.yaml",
      definitionMapping: {
        physical: "物理名",
        label_ja: "論理名",
        label_vi: "Tên nghiệp vụ",
        label_en: "Business name",
        description: "説明",
        sheet: "項目",
      },
    },
    prompts: [],
    cli: {},
    plugins: [],
    pluginSettings: {},
  };
  const ctx = { config, catalog, sqlDriverFactories: { erp: async () => driver } };

  // Resolve JA/VI labels in groupBy, aggregations, and orderBy (group column & alias)
  const aggRes = await handleQueryTable(
    {
      source: "erp",
      table: "受注",
      groupBy: ["得意先コード"],
      aggregations: [{ func: "sum", column: "Tổng tiền", as: "sum_kin" }],
      orderBy: [
        { column: "sum_kin", dir: "desc" },
        { column: "得意先コード", dir: "asc" },
      ],
      limit: 5,
    },
    ctx,
  );
  assert.match(aggRes.content, /UNTRUSTED_DOCUMENT_CONTENT/);
  assert.equal(aggRes.meta?.resultCount, 1);
  assert.equal(
    driver._queries[0]?.text,
    'SELECT "TKSK_CD", SUM("KIN") AS "sum_kin" FROM "public"."受注" GROUP BY "TKSK_CD" ORDER BY "sum_kin" DESC, "TKSK_CD" ASC LIMIT $1',
  );

  // Ambiguous label rejected in groupBy, aggregations, or orderBy before executing SQL
  const countBefore = driver._queries.length;
  await assert.rejects(
    () => handleQueryTable({ source: "erp", table: "受注", groupBy: ["重複ラベル"] }, ctx),
    /matches multiple columns/,
  );
  await assert.rejects(
    () =>
      handleQueryTable(
        { source: "erp", table: "受注", aggregations: [{ func: "sum", column: "重複ラベル" }] },
        ctx,
      ),
    /matches multiple columns/,
  );
  await assert.rejects(
    () =>
      handleQueryTable(
        { source: "erp", table: "受注", orderBy: [{ column: "重複ラベル", dir: "asc" }] },
        ctx,
      ),
    /matches multiple columns/,
  );
  await assert.rejects(
    () =>
      handleQueryTable(
        {
          source: "erp",
          table: "受注",
          groupBy: ["得意先コード"],
          aggregations: [{ func: "count", column: "*", as: "cnt" }],
          orderBy: [{ column: "Tổng tiền", dir: "desc" }],
        },
        ctx,
      ),
    /grouped column or aggregation alias/,
  );
  assert.equal(driver._queries.length, countBefore);

  // Distinct groupBy without aggregations through handleQueryTable
  await handleQueryTable(
    {
      source: "erp",
      table: "受注",
      groupBy: ["得意先コード"],
      orderBy: [{ column: "得意先コード", dir: "asc" }],
    },
    ctx,
  );
  assert.equal(
    driver._queries.at(-1)?.text,
    'SELECT "TKSK_CD" FROM "public"."受注" GROUP BY "TKSK_CD" ORDER BY "TKSK_CD" ASC LIMIT $1',
  );
});
