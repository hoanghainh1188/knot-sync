import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigError,
  createPluginHost,
  type SqlSourceConfig,
} from "@hoanghainh/knot-sync-core";
import {
  clearSqlDriverRegistry,
  createSqlMcpToolsPlugin,
  handleQueryTable,
  type SqlDriver,
  type TableMeta,
} from "@hoanghainh/knot-sync-connector-sql";
import {
  ENTERPRISE_SQL_PLUGIN_NAME,
  ENTERPRISE_SQL_TYPES,
  SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
  assertEnterpriseSqlLicense,
  createEnterpriseSqlPlugin,
  parseEnterpriseSqlSettings,
} from "./index.js";

function mockDriver(
  dialect: SqlDriver["dialect"],
  tables: Record<string, TableMeta>,
  rows: Record<string, unknown>[] = [],
): SqlDriver & { queries: { text: string; values: unknown[] }[] } {
  const queries: { text: string; values: unknown[] }[] = [];
  return {
    dialect,
    queries,
    enableReadOnly: async () => undefined,
    introspectTable: async (name) => tables[name] ?? null,
    query: async (text, values) => {
      queries.push({ text, values });
      return rows;
    },
    close: async () => undefined,
  };
}

function baseConfig(sources: SqlSourceConfig[]) {
  return {
    baseDir: "/",
    sources,
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
}

test("parseEnterpriseSqlSettings rejects unknown keys and defaults licenseEnv", () => {
  const d = parseEnterpriseSqlSettings(undefined);
  assert.equal(d.licenseEnv, "KNOT_SYNC_SQL_ENTERPRISE_LICENSE");
  assert.throws(
    () => parseEnterpriseSqlSettings({ bogus: 1 }),
    (err: unknown) => err instanceof ConfigError && /Unknown key "bogus"/.test(String(err)),
  );
  const ok = parseEnterpriseSqlSettings({
    licenseKey: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
  });
  assert.equal(ok.licenseKey, SQL_ENTERPRISE_TEST_LICENSE_SENTINEL);
});

test("missing license blocks parseSource with LICENSE guidance", () => {
  clearSqlDriverRegistry();
  const host = createPluginHost();
  host.registerPlugin(
    createEnterpriseSqlPlugin({
      settings: {},
      env: {},
    }),
  );
  const connector = host.getConnector("mssql");
  assert.ok(connector);
  assert.throws(
    () =>
      connector.parseSource(
        {
          id: "erp",
          type: "mssql",
          url: "env:KNOT_MSSQL_URL",
          allow: { 請求: { columns: ["金額"] } },
        },
        { baseDir: "/", index: 0 },
      ),
    (err: unknown) =>
      err instanceof ConfigError &&
      /KNOT_SYNC_SQL_ENTERPRISE_LICENSE/.test(String(err)) &&
      /licenseKey/.test(String(err)),
  );
});

test("licensed plugin registers four enterprise connectors; free host omits them", () => {
  clearSqlDriverRegistry();
  const free = createPluginHost();
  free.registerPlugin(createSqlMcpToolsPlugin());
  for (const type of ENTERPRISE_SQL_TYPES) {
    assert.equal(free.getConnector(type), undefined);
  }

  const paid = createPluginHost();
  paid.registerPlugin(
    createEnterpriseSqlPlugin({
      settings: { licenseKey: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL },
      env: {},
    }),
  );
  for (const type of ENTERPRISE_SQL_TYPES) {
    assert.ok(paid.getConnector(type), `expected connector ${type}`);
  }
  assert.ok(paid.loaded.some((p) => p.name === ENTERPRISE_SQL_PLUGIN_NAME));
});

test("mssql mock scan + query_table eq filter; disallowed column rejected", async () => {
  clearSqlDriverRegistry();
  const driver = mockDriver(
    "mssql",
    {
      請求: {
        name: "請求",
        columns: [
          { name: "金額", dataType: "money", isNullable: false, isPrimaryKey: false },
          { name: "secret", dataType: "text", isNullable: true, isPrimaryKey: false },
        ],
        rowEstimate: 7,
      },
    },
    [{ 金額: 100 }],
  );
  const factory = async () => driver;

  const key = "KNOT_TEST_MSSQL_" + String(process.pid);
  process.env[key] = "mssql://u:p@localhost/db";
  try {
    const host = createPluginHost();
    host.registerPlugin(
      createEnterpriseSqlPlugin({
        settings: { licenseKey: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL },
        env: process.env,
        driverFactories: { mssql: factory },
      }),
    );
    host.registerPlugin(createSqlMcpToolsPlugin());

    const connector = host.getConnector("mssql")!;
    const source = connector.parseSource(
      {
        id: "erp",
        type: "mssql",
        url: `env:${key}`,
        allow: { 請求: { columns: ["金額"] } },
      },
      { baseDir: "/", index: 0 },
    ) as SqlSourceConfig;

    const entries = [];
    for await (const e of connector.scan(source)) {
      entries.push(e);
    }
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.relPath, "請求");
    assert.equal(entries[0]?.size, 7);

    const ctx = {
      config: baseConfig([source]),
      sqlDriverFactories: { erp: factory },
    };
    const queried = await handleQueryTable(
      {
        source: "erp",
        table: "請求",
        filters: [{ op: "eq", column: "金額", value: 100 }],
      },
      ctx,
    );
    assert.equal(queried.meta?.resultCount, 1);
    assert.ok(driver.queries.some((q) => /SELECT TOP \d+/.test(q.text)));
    assert.ok(driver.queries.some((q) => /\[金額\] = \?/.test(q.text)));

    await assert.rejects(
      () =>
        handleQueryTable(
          {
            source: "erp",
            table: "請求",
            filters: [{ op: "eq", column: "SALARY", value: 1 }],
          },
          ctx,
        ),
      /not allow-listed/,
    );
  } finally {
    delete process.env[key];
    clearSqlDriverRegistry();
  }
});

test("oracle/access/as400 mock factories scan JP/VN tables", async () => {
  clearSqlDriverRegistry();
  const cases: Array<{
    type: "oracle" | "access" | "as400";
    table: string;
    column: string;
  }> = [
    { type: "oracle", table: "受注", column: "得意先名" },
    { type: "access", table: "hoa_don", column: "ma_kh" },
    { type: "as400", table: "請求", column: "金額" },
  ];

  for (const c of cases) {
    const driver = mockDriver(c.type, {
      [c.table]: {
        name: c.table,
        columns: [
          {
            name: c.column,
            dataType: "varchar",
            isNullable: false,
            isPrimaryKey: false,
          },
        ],
        rowEstimate: 3,
      },
    });
    const factory = async () => driver;
    const envKey = `KNOT_TEST_${c.type.toUpperCase()}_${process.pid}`;
    process.env[envKey] = `${c.type}://mock`;
    try {
      const host = createPluginHost();
      host.registerPlugin(
        createEnterpriseSqlPlugin({
          settings: { licenseKey: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL },
          env: process.env,
          driverFactories: { [c.type]: factory },
        }),
      );
      const connector = host.getConnector(c.type)!;
      const source = connector.parseSource(
        {
          id: c.type,
          type: c.type,
          url: `env:${envKey}`,
          allow: { [c.table]: { columns: [c.column] } },
        },
        { baseDir: "/", index: 0 },
      );
      const entries = [];
      for await (const e of connector.scan(source)) entries.push(e);
      assert.equal(entries.length, 1, c.type);
      assert.equal(entries[0]?.relPath, c.table);
    } finally {
      delete process.env[envKey];
      clearSqlDriverRegistry();
    }
  }
});

test("assertEnterpriseSqlLicense accepts sentinel via env", () => {
  const envKey = "KNOT_SQL_ENT_TEST_" + String(process.pid);
  const settings = parseEnterpriseSqlSettings({ licenseEnv: envKey });
  assert.throws(() => assertEnterpriseSqlLicense(settings, {}), /license/);
  assert.doesNotThrow(() =>
    assertEnterpriseSqlLicense(settings, {
      [envKey]: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
    }),
  );
});

test("soft-fail messages name missing odbc/oracledb modules", async () => {
  const { createOracleDriver } = await import("./oracle.js");
  const { createOdbcSqlDriver } = await import("./odbc-driver.js");
  await assert.rejects(
    () => createOracleDriver("oracle://u:p@h:1521/db", {}, null),
    /oracledb/,
  );
  await assert.rejects(
    () => createOdbcSqlDriver("access", "DSN=Access", {}, null),
    /odbc|Access/,
  );
  await assert.rejects(
    () => createOdbcSqlDriver("as400", "DSN=AS400", {}, null),
    /odbc|IBM i|AS400/,
  );
});
