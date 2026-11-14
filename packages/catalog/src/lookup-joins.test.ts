import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CatalogError,
  CatalogResolveError,
  emptyColumn,
  emptyLookupJoin,
  emptyTable,
  mergeCatalog,
  parseCatalogYaml,
  resolveActiveLookupJoins,
  resolveQueryColumn,
  type CatalogDocument,
} from "./index.js";

describe("lookupJoins YAML parsing and merge preservation", () => {
  it("parses valid lookupJoins with Japanese and Vietnamese labels and reviewed: true", () => {
    const yaml = `
version: 1
sources:
  erp:
    tables:
      juchu:
        label: { ja: "受注", vi: "Đơn hàng", en: "Orders" }
        reviewed: true
        columns:
          JUCHU_NO: { type: "TEXT", reviewed: true }
          TKSK_CD: { type: "TEXT", references: "tokuisaki_mst.TKSK_CD", reviewed: true }
        lookupJoins:
          - name: tokuisaki
            targetTable: tokuisaki_mst
            localColumn: TKSK_CD
            targetColumn: TKSK_CD
            reviewed: true
            columns:
              TKSK_NM:
                label: { ja: "得意先名", vi: "Tên khách hàng", en: "Customer Name" }
                type: TEXT
                reviewed: true
`;
    const doc = parseCatalogYaml(yaml);
    const joins = doc.sources.erp?.tables.juchu?.lookupJoins;
    assert.ok(joins?.[0]);
    const j0 = joins[0];
    assert.equal(joins.length, 1);
    assert.equal(j0.name, "tokuisaki");
    assert.equal(j0.targetTable, "tokuisaki_mst");
    assert.equal(j0.localColumn, "TKSK_CD");
    assert.equal(j0.targetColumn, "TKSK_CD");
    assert.equal(j0.reviewed, true);
    assert.equal(j0.columns.TKSK_NM?.label.ja, "得意先名");
    assert.equal(j0.columns.TKSK_NM?.label.vi, "Tên khách hàng");
  });

  it("defaults reviewed to false when omitted in lookupJoins", () => {
    const yaml = `
version: 1
sources:
  erp:
    tables:
      juchu:
        columns:
          TKSK_CD: { type: TEXT }
        lookupJoins:
          - name: tokuisaki
            targetTable: tokuisaki_mst
            localColumn: TKSK_CD
            targetColumn: TKSK_CD
            columns:
              TKSK_NM: { type: TEXT }
`;
    const doc = parseCatalogYaml(yaml);
    assert.equal(doc.sources.erp?.tables.juchu?.lookupJoins?.[0]?.reviewed, false);
  });

  it("rejects invalid lookupJoins entries (missing fields, unknown keys, duplicates, base-table collision)", () => {
    const invalidCases = [
      // Missing targetTable
      `
version: 1
sources:
  s:
    tables:
      t:
        columns: {}
        lookupJoins:
          - name: j
            localColumn: a
            targetColumn: b
            columns: {}
`,
      // Unknown key
      `
version: 1
sources:
  s:
    tables:
      t:
        columns: {}
        lookupJoins:
          - name: j
            targetTable: t2
            localColumn: a
            targetColumn: b
            columns: {}
            joinType: INNER
`,
      // Duplicate name
      `
version: 1
sources:
  s:
    tables:
      t:
        columns: {}
        lookupJoins:
          - name: j
            targetTable: t2
            localColumn: a
            targetColumn: b
            columns: {}
          - name: j
            targetTable: t3
            localColumn: c
            targetColumn: d
            columns: {}
`,
      // Name colliding with base table
      `
version: 1
sources:
  s:
    tables:
      t:
        columns: {}
        lookupJoins:
          - name: t
            targetTable: t2
            localColumn: a
            targetColumn: b
            columns: {}
`,
    ];

    for (const yaml of invalidCases) {
      assert.throws(() => parseCatalogYaml(yaml), CatalogError);
    }
  });

  it("preserves reviewed: true lookupJoins on mergeCatalog and never auto-approves unreviewed ones", () => {
    const existing: CatalogDocument = {
      version: 1,
      sources: {
        erp: {
          tables: {
            juchu: emptyTable({
              reviewed: true,
              columns: { TKSK_CD: emptyColumn({ type: "TEXT", reviewed: true }) },
              lookupJoins: [
                emptyLookupJoin({
                  name: "tokuisaki",
                  targetTable: "tokuisaki_mst",
                  localColumn: "TKSK_CD",
                  targetColumn: "TKSK_CD",
                  reviewed: true,
                  columns: {
                    TKSK_NM: emptyColumn({
                      label: { ja: "得意先名", vi: "", en: "Customer" },
                      reviewed: true,
                    }),
                  },
                }),
                emptyLookupJoin({
                  name: "tantou",
                  targetTable: "shain_mst",
                  localColumn: "TANTO_CD",
                  targetColumn: "SHAIN_CD",
                  reviewed: false,
                  columns: { SHAIN_NM: emptyColumn({ type: "TEXT", reviewed: false }) },
                }),
              ],
            }),
          },
        },
      },
    };

    const incoming: CatalogDocument = {
      version: 1,
      sources: {
        erp: {
          tables: {
            juchu: emptyTable({
              columns: { TKSK_CD: emptyColumn({ type: "VARCHAR" }) },
              lookupJoins: [
                emptyLookupJoin({
                  name: "tokuisaki",
                  targetTable: "tokuisaki_mst",
                  localColumn: "TKSK_CD",
                  targetColumn: "TKSK_CD",
                  reviewed: false,
                  columns: { TKSK_NM: emptyColumn({ type: "TEXT" }) },
                }),
                emptyLookupJoin({
                  name: "tantou",
                  targetTable: "shain_mst",
                  localColumn: "TANTO_CD",
                  targetColumn: "SHAIN_CD",
                  reviewed: true, // Even if draft had reviewed: true, merge must not auto-approve
                  columns: { SHAIN_NM: emptyColumn({ type: "TEXT" }) },
                }),
              ],
            }),
          },
        },
      },
    };

    const merged = mergeCatalog(existing, incoming);
    const joins = merged.sources.erp?.tables.juchu?.lookupJoins ?? [];
    assert.equal(joins.length, 2);

    const tokuisaki = joins.find((j) => j.name === "tokuisaki");
    assert.equal(tokuisaki?.reviewed, true);
    assert.equal(tokuisaki?.columns.TKSK_NM?.label.ja, "得意先名");

    const tantou = joins.find((j) => j.name === "tantou");
    assert.equal(tantou?.reviewed, false);
  });
});

describe("resolveActiveLookupJoins and resolveQueryColumn dual-gate enforcement", () => {
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
              NAME: emptyColumn({ label: { ja: "名称", vi: "Tên", en: "Name" }, reviewed: true }),
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
                  NAME: emptyColumn({
                    label: { ja: "名称", vi: "Tên", en: "Name" },
                    reviewed: true,
                  }),
                  SECRET_COL: emptyColumn({
                    label: { ja: "秘密", vi: "Mật", en: "Secret" },
                    reviewed: true,
                  }),
                },
              }),
              emptyLookupJoin({
                name: "unreviewed_join",
                targetTable: "shain_mst",
                localColumn: "TKSK_CD",
                targetColumn: "SHAIN_CD",
                reviewed: false,
                columns: {
                  SHAIN_NM: emptyColumn({
                    label: { ja: "社員名", vi: "Tên nhân viên", en: "Employee" },
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

  it("activates only reviewed joins whose base/target keys and columns are in source.allow", () => {
    const allow = {
      juchu: ["JUCHU_NO", "TKSK_CD", "NAME"],
      tokuisaki_mst: ["TKSK_CD", "TKSK_NM", "NAME"], // SECRET_COL omitted
      shain_mst: ["SHAIN_CD", "SHAIN_NM"],
    };
    const active = resolveActiveLookupJoins(catalog, "erp", "juchu", allow);
    assert.equal(active.length, 1);
    assert.equal(active[0]?.name, "tokuisaki");
    assert.deepEqual(Object.keys(active[0]?.columns ?? {}), ["TKSK_NM", "NAME"]);
  });

  it("deactivates join if localColumn or targetColumn is missing from source.allow", () => {
    const missingLocal = {
      juchu: ["JUCHU_NO"], // TKSK_CD missing
      tokuisaki_mst: ["TKSK_CD", "TKSK_NM"],
    };
    assert.equal(resolveActiveLookupJoins(catalog, "erp", "juchu", missingLocal).length, 0);

    const missingTargetKey = {
      juchu: ["JUCHU_NO", "TKSK_CD"],
      tokuisaki_mst: ["TKSK_NM"], // TKSK_CD missing
    };
    assert.equal(resolveActiveLookupJoins(catalog, "erp", "juchu", missingTargetKey).length, 0);
  });

  it("resolves qualified lookup names and Japanese/Vietnamese business labels", () => {
    const allow = {
      juchu: ["JUCHU_NO", "TKSK_CD", "NAME"],
      tokuisaki_mst: ["TKSK_CD", "TKSK_NM", "NAME"],
    };
    const baseSet = new Set(allow.juchu);

    const byQualified = resolveQueryColumn(catalog, "erp", "juchu", "tokuisaki.TKSK_NM", baseSet, allow);
    assert.equal(byQualified.joinName, "tokuisaki");
    assert.equal(byQualified.column, "TKSK_NM");

    const byJa = resolveQueryColumn(catalog, "erp", "juchu", "得意先名", baseSet, allow);
    assert.equal(byJa.qualifiedName, "tokuisaki.TKSK_NM");

    const byVi = resolveQueryColumn(catalog, "erp", "juchu", "Tên khách hàng", baseSet, allow);
    assert.equal(byVi.qualifiedName, "tokuisaki.TKSK_NM");
  });

  it("rejects unreviewed, disallowed, and ambiguous-label lookup columns clearly", () => {
    const allow = {
      juchu: ["JUCHU_NO", "TKSK_CD", "NAME"],
      tokuisaki_mst: ["TKSK_CD", "TKSK_NM", "NAME"],
      shain_mst: ["SHAIN_CD", "SHAIN_NM"],
    };
    const baseSet = new Set(allow.juchu);

    assert.throws(
      () => resolveQueryColumn(catalog, "erp", "juchu", "unreviewed_join.SHAIN_NM", baseSet, allow),
      (err: unknown) => err instanceof CatalogResolveError && /not reviewed/i.test(err.message),
    );
    assert.throws(
      () => resolveQueryColumn(catalog, "erp", "juchu", "社員名", baseSet, allow),
      (err: unknown) => err instanceof CatalogResolveError && /not reviewed/i.test(err.message),
    );
    assert.throws(
      () => resolveQueryColumn(catalog, "erp", "juchu", "tokuisaki.SECRET_COL", baseSet, allow),
      (err: unknown) => err instanceof CatalogResolveError && /not allow-listed/i.test(err.message),
    );
    assert.throws(
      () => resolveQueryColumn(catalog, "erp", "juchu", "名称", baseSet, allow),
      (err: unknown) => err instanceof CatalogResolveError && /multiple columns/i.test(err.message),
    );
  });
});
