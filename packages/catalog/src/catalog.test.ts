import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applySuggestions,
  buildDefinitionFixture,
  buildDescribeDraft,
  combineLabels,
  createCatalogPlugin,
  createRomajiCatalogSource,
  emptyCatalog,
  emptyColumn,
  emptyTable,
  loadCatalogFile,
  loadDefinitionExcel,
  mergeCatalog,
  parseCatalogYaml,
  suggestFromRomaji,
  suggestFromVietnamese,
  tokenizePhysicalName,
  writeCatalogFile,
} from "./index.js";
import { loadPlugins, type CatalogSource } from "@hoanghainh/knot-sync-core";

test("parseCatalogYaml round-trips Japanese physical names", () => {
  const doc = parseCatalogYaml(`
version: 1
sources:
  erp:
    tables:
      受注:
        label: { ja: "受注", vi: "", en: "Orders" }
        description: ""
        reviewed: false
        columns:
          得意先コード:
            label: { ja: "得意先コード", vi: "", en: "" }
            description: ""
            type: "varchar"
            values: []
            pii: false
            expose: true
            reviewed: false
`);
  assert.equal(doc.version, 1);
  const col = doc.sources.erp?.tables["受注"]?.columns["得意先コード"];
  assert.ok(col);
  assert.equal(col.label.ja, "得意先コード");
});

test("writeCatalogFile then loadCatalogFile", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-catalog-"));
  const path = join(dir, "knot-sync.catalog.yaml");
  const doc = emptyCatalog();
  doc.sources.erp = {
    tables: {
      hoa_don: emptyTable({
        label: { ja: "", vi: "hóa đơn", en: "invoice" },
        columns: {
          ma_kh: emptyColumn({
            label: { ja: "", vi: "mã khách hàng", en: "" },
            type: "varchar",
          }),
        },
      }),
    },
  };
  await writeCatalogFile(path, doc);
  const loaded = await loadCatalogFile(path);
  assert.equal(loaded.sources.erp?.tables.hoa_don?.columns.ma_kh?.label.vi, "mã khách hàng");
  const text = await readFile(path, "utf8");
  assert.match(text, /ma_kh/);
});

test("merge preserves reviewed column fields", () => {
  const existing = emptyCatalog();
  existing.sources.erp = {
    tables: {
      t: emptyTable({
        columns: {
          TKSK_CD: emptyColumn({
            label: { ja: "得意先コード", vi: "", en: "" },
            reviewed: true,
          }),
        },
      }),
    },
  };
  const draft = emptyCatalog();
  draft.sources.erp = {
    tables: {
      t: emptyTable({
        columns: {
          TKSK_CD: emptyColumn({
            label: { ja: "WRONG", vi: "x", en: "y" },
            description: "new",
            type: "int",
            reviewed: false,
          }),
          NEW_COL: emptyColumn({
            label: { ja: "新規", vi: "", en: "" },
          }),
        },
      }),
    },
  };
  const merged = mergeCatalog(existing, draft);
  const col = merged.sources.erp!.tables.t!.columns.TKSK_CD!;
  assert.equal(col.label.ja, "得意先コード");
  assert.equal(col.reviewed, true);
  assert.equal(col.description, "");
  assert.ok(merged.sources.erp!.tables.t!.columns.NEW_COL);
});

test("romaji dictionary expands TKSK_CD", () => {
  assert.deepEqual(tokenizePhysicalName("TKSK_CD"), ["TKSK", "CD"]);
  const label = suggestFromRomaji("TKSK_CD");
  assert.match(label.ja, /得意先/);
  assert.match(label.ja, /コード/);
});

test("vietnamese dictionary expands ma_kh", () => {
  const label = suggestFromVietnamese("ma_kh");
  assert.match(label.vi, /mã/);
  assert.match(label.vi, /khách hàng/);
});

test("combineLabels prefers later non-empty", () => {
  const combined = combineLabels(
    { ja: "A", vi: "", en: "" },
    { ja: "", vi: "B", en: "C" },
  );
  assert.deepEqual(combined, { ja: "A", vi: "B", en: "C" });
});

test("missing catalog file loads empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-catalog-"));
  const doc = await loadCatalogFile(join(dir, "missing.yaml"));
  assert.deepEqual(doc, emptyCatalog());
});

test("invalid catalog key fails clearly", () => {
  assert.throws(() => parseCatalogYaml("version: 1\nfoo: 1\n"), /unknown key "foo"/);
});

test("customer-style write then parse", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-catalog-"));
  const path = join(dir, "c.yaml");
  await writeFile(
    path,
    `version: 1\nsources:\n  a:\n    tables: {}\n`,
    "utf8",
  );
  const doc = await loadCatalogFile(path);
  assert.equal(doc.sources.a?.tables !== undefined, true);
});

test("definition Excel enriches Vietnamese physical name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-catalog-"));
  const xlsxPath = join(dir, "defs.xlsx");
  const buf = await buildDefinitionFixture([
    {
      physical: "ma_kh",
      label_vi: "mã khách hàng",
      description: "Customer code",
    },
  ]);
  await writeFile(xlsxPath, buf);
  const index = await loadDefinitionExcel(xlsxPath);
  const hit = index.get("ma_kh");
  assert.ok(hit);
  assert.equal(hit.label.vi, "mã khách hàng");
});

test("romaji CatalogSource suggest for TKSK_CD", () => {
  const src = createRomajiCatalogSource();
  const suggestion = applySuggestions([src], {
    sourceId: "erp",
    table: "受注",
    column: "TKSK_CD",
  });
  assert.match(suggestion.label?.ja ?? "", /得意先/);
  assert.match(suggestion.label?.ja ?? "", /コード/);
});

test("catalog plugin registers dictionary sources", async () => {
  const host = await loadPlugins({
    builtins: [createCatalogPlugin()],
    entries: [],
    baseDir: "/",
    pluginSettings: {},
  });
  assert.ok(host.catalogSources.has("dict-romaji"));
  assert.ok(host.catalogSources.has("dict-vi"));
});

test("resolveColumnName accepts Vietnamese business label and enum gates", async () => {
  const { resolveColumnName, validateEnumFilter } = await import("./index.js");
  const catalog = emptyCatalog();
  catalog.sources.erp = {
    tables: {
      hoa_don: emptyTable({
        columns: {
          ma_kh: emptyColumn({
            label: { ja: "", vi: "mã khách hàng", en: "" },
            values: ["A", "B"],
          }),
        },
      }),
    },
  };
  const allowed = new Set(["ma_kh"]);
  assert.equal(
    resolveColumnName(catalog, "erp", "hoa_don", "mã khách hàng", allowed),
    "ma_kh",
  );
  const col = catalog.sources.erp!.tables.hoa_don!.columns.ma_kh;
  assert.match(validateEnumFilter(col, "eq", ["Z"]) ?? "", /not in catalog/);
  assert.equal(validateEnumFilter(col, "eq", ["A"]), null);
});

test("buildDescribeDraft uses hooks and sources", async () => {
  const draft = await buildDescribeDraft({
    sqlSources: [
      {
        id: "erp",
        type: "postgres",
        url: "postgres://x",
        urlEnv: "X",
        allow: { 受注: { columns: ["TKSK_CD", "KIN"] } },
      },
    ],
    catalogSources: [createRomajiCatalogSource()],
    hooks: {
      async introspectTable() {
        return {
          name: "受注",
          columns: [
            { name: "TKSK_CD", dataType: "varchar" },
            { name: "KIN", dataType: "numeric" },
          ],
        };
      },
      async sampleDistinct(_s, _t, column) {
        return column === "KIN" ? ["100", "200"] : [];
      },
    },
  });
  const col = draft.sources.erp?.tables["受注"]?.columns.TKSK_CD;
  assert.ok(col);
  assert.match(col.label.ja, /得意先/);
  assert.deepEqual(draft.sources.erp?.tables["受注"]?.columns.KIN?.values, ["100", "200"]);
});

test("fill-empty catalog-llm does not overwrite dictionary; blank gets draft", async () => {
  let llmCalls = 0;
  const llm: CatalogSource = {
    id: "catalog-llm",
    async suggest(input) {
      llmCalls += 1;
      if (input.column === "TKSK_CD") {
        return { label: { ja: "SHOULD_NOT_WIN" } };
      }
      return {
        label: { ja: "予備", vi: "dự phòng" },
        description: "llm draft",
      };
    },
  };

  const draft = await buildDescribeDraft({
    sqlSources: [
      {
        id: "erp",
        type: "postgres",
        url: "postgres://x",
        urlEnv: "X",
        // qqq_unk is intentionally unknown to romaji/vi dictionaries
        allow: { 受注: { columns: ["TKSK_CD", "qqq_unk"] } },
      },
    ],
    catalogSources: [createRomajiCatalogSource(), llm],
    hooks: {
      async introspectTable() {
        return {
          name: "受注",
          columns: [
            { name: "TKSK_CD", dataType: "varchar" },
            { name: "qqq_unk", dataType: "varchar" },
          ],
        };
      },
      async sampleDistinct() {
        return [];
      },
    },
  });

  const tksk = draft.sources.erp?.tables["受注"]?.columns.TKSK_CD;
  assert.ok(tksk);
  assert.match(tksk.label.ja, /得意先/);
  assert.doesNotMatch(tksk.label.ja, /SHOULD_NOT_WIN/);
  assert.equal(tksk.reviewed, false);

  const blank = draft.sources.erp?.tables["受注"]?.columns.qqq_unk;
  assert.ok(blank);
  assert.equal(blank.label.ja, "予備");
  assert.equal(blank.label.vi, "dự phòng");
  assert.equal(blank.description, "llm draft");
  assert.equal(blank.reviewed, false);
  // LLM skipped for TKSK_CD because labels already filled.
  assert.equal(llmCalls, 1);
});
