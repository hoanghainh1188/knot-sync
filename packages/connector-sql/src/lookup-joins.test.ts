import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyColumn,
  emptyLookupJoin,
  emptyTable,
  type CatalogDocument,
} from "@hoanghainh/knot-sync-catalog";
import type { AppConfig } from "@hoanghainh/knot-sync-core";
import type { DriverFactory, SqlDriver } from "./driver.js";
import { handleDescribeTable, handleQueryTable, type SqlToolContext } from "./mcp-tools.js";
import { buildSelectQuery } from "./query-build.js";

function createMockDriverFactory(onQuery?: (sql: string, values: unknown[]) => void): DriverFactory {
  return async () => {
    const driver: SqlDriver = {
      dialect: "postgres",
      async enableReadOnly() {},
      async introspectTable(table) {
        return {
          name: table,
          rowEstimate: 1,
          columns: [
            { name: "JUCHU_NO", dataType: "text", isNullable: false, isPrimaryKey: true },
            { name: "TKSK_CD", dataType: "text", isNullable: false, isPrimaryKey: false },
            { name: "KINGAKU", dataType: "integer", isNullable: false, isPrimaryKey: false },
          ],
        };
      },
      async query(sql, values) {
        onQuery?.(sql, values);
        return [{ JUCHU_NO: "J-001", "tokuisaki.TKSK_NM": "東京商事" }];
      },
      async close() {},
    };
    return driver;
  };
}

describe("lookupJoins in buildSelectQuery and MCP tools", () => {
  const baseConfig = {
    sources: [
      {
        id: "erp",
        type: "postgres",
        url: "postgres://localhost/erp",
        urlEnv: "ERP_DB_URL",
        allow: {
          juchu: { columns: ["JUCHU_NO", "TKSK_CD", "KINGAKU"] },
          tokuisaki_mst: { columns: ["TKSK_CD", "TKSK_NM"] },
          shain_mst: { columns: ["SHAIN_CD", "SHAIN_NM"] },
        },
      },
    ],
  } as unknown as AppConfig;

  const catalog: CatalogDocument = {
    version: 1,
    sources: {
      erp: {
        tables: {
          juchu: emptyTable({
            reviewed: true,
            columns: {
              JUCHU_NO: emptyColumn({ label: { ja: "受注番号", vi: "Số đơn", en: "Order No" }, reviewed: true }),
              TKSK_CD: emptyColumn({ label: { ja: "得意先コード", vi: "Mã KH", en: "Customer Code" }, reviewed: true }),
              KINGAKU: emptyColumn({ label: { ja: "金額", vi: "Số tiền", en: "Amount" }, reviewed: true }),
            },
            lookupJoins: [
              emptyLookupJoin({
                name: "tokuisaki",
                targetTable: "tokuisaki_mst",
                localColumn: "TKSK_CD",
                targetColumn: "TKSK_CD",
                reviewed: true,
                columns: {
                  TKSK_NM: emptyColumn({
                    label: { ja: "得意先名", vi: "Tên khách hàng", en: "Customer Name" },
                    reviewed: true,
                  }),
                },
              }),
              emptyLookupJoin({
                name: "tantou",
                targetTable: "shain_mst",
                localColumn: "TKSK_CD",
                targetColumn: "SHAIN_CD",
                reviewed: false,
                columns: {
                  SHAIN_NM: emptyColumn({
                    label: { ja: "担当者名", vi: "Nhân viên", en: "Sales Rep" },
                    reviewed: false,
                  }),
                },
              }),
            ],
          }),
        },
      },
    },
  };

  it("omits LEFT JOIN when no lookup columns are referenced", () => {
    const built = buildSelectQuery({
      dialect: "postgres",
      table: "juchu",
      selectColumns: ["JUCHU_NO", "KINGAKU"],
      allowedColumns: new Set(["JUCHU_NO", "TKSK_CD", "KINGAKU"]),
      joins: [
        {
          alias: "tokuisaki",
          targetTable: "tokuisaki_mst",
          localColumn: "TKSK_CD",
          targetColumn: "TKSK_CD",
          allowedColumns: ["TKSK_NM"],
        },
      ],
    });
    assert.ok(!built.text.includes("LEFT JOIN"));
    assert.equal(built.text, 'SELECT "JUCHU_NO", "KINGAKU" FROM "juchu" LIMIT $1');
  });

  it("builds parameterized LEFT JOIN with quoteIdent when lookup columns are selected, filtered, and sorted", () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const ctx: SqlToolContext = {
      config: baseConfig,
      catalog,
      sqlDriverFactories: {
        erp: createMockDriverFactory((sql, values) => queries.push({ sql, values })),
      },
    };

    return handleQueryTable(
      {
        source: "erp",
        table: "juchu",
        columns: ["JUCHU_NO", "tokuisaki.TKSK_NM"],
        filters: [{ column: "得意先名", op: "contains", value: "商事" }],
        orderBy: [{ column: "Tên khách hàng", dir: "asc" }],
        limit: 10,
      },
      ctx,
    ).then((res) => {
      assert.equal(queries.length, 1);
      const q = queries[0]!;
      assert.ok(
        q.sql.includes(
          'LEFT JOIN "public"."tokuisaki_mst" AS "tokuisaki" ON "juchu"."TKSK_CD" = "tokuisaki"."TKSK_CD"',
        ),
      );
      assert.ok(q.sql.includes('"tokuisaki"."TKSK_NM" AS "tokuisaki.TKSK_NM"'));
      assert.ok(q.sql.includes('WHERE "tokuisaki"."TKSK_NM" LIKE $1 ESCAPE \'\\\''));
      assert.ok(q.sql.includes('ORDER BY "tokuisaki"."TKSK_NM" ASC'));
      assert.deepEqual(q.values, ["%商事%", 10]);
      assert.ok(res.content.includes("untrusted"));
      assert.ok(res.content.includes("東京商事"));
    });
  });

  it("supports groupBy and aggregations alongside active lookup columns", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const ctx: SqlToolContext = {
      config: baseConfig,
      catalog,
      sqlDriverFactories: {
        erp: createMockDriverFactory((sql, values) => queries.push({ sql, values })),
      },
    };

    await handleQueryTable(
      {
        source: "erp",
        table: "juchu",
        groupBy: ["得意先名"],
        aggregations: [{ func: "sum", column: "KINGAKU", as: "total_amount" }],
        orderBy: [{ column: "得意先名", dir: "desc" }],
      },
      ctx,
    );

    assert.equal(queries.length, 1);
    const sql = queries[0]!.sql;
    assert.ok(sql.includes('SUM("juchu"."KINGAKU") AS "total_amount"'));
    assert.ok(sql.includes('GROUP BY "tokuisaki"."TKSK_NM"'));
    assert.ok(sql.includes('ORDER BY "tokuisaki"."TKSK_NM" DESC'));
  });

  it("rejects unreviewed joins, non-allow-listed target columns, and arbitrary JOIN syntax without executing SQL", async () => {
    let executed = 0;
    const ctx: SqlToolContext = {
      config: baseConfig,
      catalog,
      sqlDriverFactories: {
        erp: createMockDriverFactory(() => {
          executed += 1;
        }),
      },
    };

    // Unreviewed join
    await assert.rejects(
      () =>
        handleQueryTable(
          { source: "erp", table: "juchu", columns: ["JUCHU_NO", "tantou.SHAIN_NM"] },
          ctx,
        ),
      /not reviewed/i,
    );

    // Arbitrary JOIN syntax in columns/filters
    await assert.rejects(
      () =>
        handleQueryTable(
          {
            source: "erp",
            table: "juchu",
            columns: ["JUCHU_NO FROM juchu JOIN secret ON 1=1"],
          },
          ctx,
        ),
      /not allow-listed/i,
    );

    // Non-allow-listed target table
    const restrictedConfig = {
      sources: [
        {
          id: "erp",
          type: "postgres",
          url: "postgres://localhost/erp",
          urlEnv: "ERP_DB_URL",
          allow: {
            juchu: { columns: ["JUCHU_NO", "TKSK_CD"] },
            // tokuisaki_mst omitted!
          },
        },
      ],
    } as unknown as AppConfig;
    await assert.rejects(
      () =>
        handleQueryTable(
          { source: "erp", table: "juchu", columns: ["JUCHU_NO", "tokuisaki.TKSK_NM"] },
          { ...ctx, config: restrictedConfig },
        ),
      /not allow-listed/i,
    );

    assert.equal(executed, 0);
  });

  it("surfaces active lookup columns in describe_table and hides unreviewed ones", async () => {
    const ctx: SqlToolContext = {
      config: baseConfig,
      catalog,
      sqlDriverFactories: {
        erp: createMockDriverFactory(),
      },
    };

    const res = await handleDescribeTable({ source: "erp", table: "juchu" }, ctx);
    assert.ok(res.content.includes("tokuisaki.TKSK_NM"));
    assert.ok(res.content.includes("得意先名"));
    assert.ok(!res.content.includes("tantou"));
    assert.ok(!res.content.includes("SHAIN_NM"));
  });
});
