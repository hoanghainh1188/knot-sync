import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CLEANING_CONFIG,
  documentId,
  sha256,
  type Document,
} from "@hoanghainh/knot-sync-core";
import {
  cleanDocument,
  convertLegacyVietnamese,
  convertWareki,
  createJaViCleaner,
  encodeTcvn3ForTest,
  encodeVniForTest,
  estimateTokens,
  parseKanjiNumeral,
} from "./index.js";

function doc(content: string, tables: Document["tables"] = []): Document {
  return {
    id: documentId("s", "a.txt"),
    sourceId: "s",
    type: "txt",
    title: "a.txt",
    content,
    tables,
    metadata: {},
    pii: [],
    guard: [],
    hash: sha256(content),
  };
}

test("NFKC full-width digits", () => {
  const out = cleanDocument(doc("年２０２４"), DEFAULT_CLEANING_CONFIG);
  assert.match(out.content, /2024/);
  assert.equal(out.metadata.originalContent, "年２０２４");
});

test("wareki Reiwa and gannen", () => {
  assert.equal(convertWareki("令和5年4月1日"), "2023-04-01");
  assert.match(convertWareki("令和元年の契約"), /2019/);
  assert.equal(parseKanjiNumeral("三十一"), 31);
  const out = cleanDocument(doc("契約日: 令和三十一年1月2日"), {
    ...DEFAULT_CLEANING_CONFIG,
    datesIso: false,
  });
  // 令和31 = 2019+30 = 2049
  assert.match(out.content, /2049-01-02/);
});

test("ISO dates from slash and JP forms", () => {
  const out = cleanDocument(doc("due 2024/1/5 and 2024年1月5日"), {
    ...DEFAULT_CLEANING_CONFIG,
    wareki: false,
  });
  assert.match(out.content, /2024-01-05/);
  assert.equal((out.content.match(/2024-01-05/g) ?? []).length, 2);
});

test("ambiguous day-month left alone", () => {
  const out = cleanDocument(doc("on 01/02/2024"), {
    ...DEFAULT_CLEANING_CONFIG,
    wareki: false,
    nfkc: false,
    legacyVietnamese: false,
    tokenReduce: false,
  });
  assert.match(out.content, /01\/02\/2024/);
});

test("TCVN3 fixture converts to Unicode Vietnamese", () => {
  // Use letters that encode to distinctive TCVN3 glyphs (µ ¶ · ¸ ¹…), not café/©.
  const unicode = "Hà Nội đã có bà và các ả ạ";
  const encoded = encodeTcvn3ForTest(unicode);
  assert.notEqual(encoded, unicode);
  assert.match(encoded, /[µ¶·¸¹»¼½¾]/);
  const converted = convertLegacyVietnamese(encoded);
  assert.equal(converted, unicode);
  const out = cleanDocument(doc(encoded), DEFAULT_CLEANING_CONFIG);
  assert.match(out.content, /Hà Nội/);
  assert.match(out.content, /đã/);

  // Western European text must not be treated as TCVN3.
  const cafe = cleanDocument(
    doc("Café résumé naïve façade déjà vu — © 2024 ACME® Corp"),
    DEFAULT_CLEANING_CONFIG,
  );
  assert.match(cafe.content, /Café/);
  assert.match(cafe.content, /© 2024/);
});

test("VNI-Windows sample converts; English left alone", () => {
  const unicode = "Tiếng Việt để làm việc";
  const vni = encodeVniForTest(unicode);
  assert.notEqual(vni, unicode);
  const out = cleanDocument(doc(vni), {
    ...DEFAULT_CLEANING_CONFIG,
    nfkc: false,
    wareki: false,
    datesIso: false,
    tokenReduce: false,
  });
  assert.match(out.content, /Tiếng/);
  assert.match(out.content, /Việt/);

  const english = cleanDocument(
    doc("Purchase orders and users' passwords on the floor"),
    DEFAULT_CLEANING_CONFIG,
  );
  assert.match(english.content, /Purchase orders/);
  assert.doesNotMatch(english.content, /Pủcháe|ỏdẻs|páswỏds/);
});

test("token reduction collapses whitespace and empty rows", () => {
  const out = cleanDocument(
    doc("a   b\n\n\n\nc", [
      {
        headers: ["A", "B", ""],
        rows: [
          ["1", "2", ""],
          ["", "", ""],
          ["3", "4", ""],
        ],
      },
    ]),
    {
      ...DEFAULT_CLEANING_CONFIG,
      nfkc: false,
      wareki: false,
      datesIso: false,
      legacyVietnamese: false,
    },
  );
  assert.doesNotMatch(out.content, /a {2,}b/);
  assert.equal(out.tables[0]?.rows.length, 2);
  assert.ok(typeof out.metadata.tokensBefore === "number");
  assert.ok(typeof out.metadata.tokensAfter === "number");
  assert.ok(
    (out.metadata.tokensAfter as number) <= (out.metadata.tokensBefore as number),
  );
});

test("all steps off keeps content identity", () => {
  const input = "令和5年  ２０２４  and TCVN";
  const out = cleanDocument(doc(input), {
    nfkc: false,
    wareki: false,
    datesIso: false,
    legacyVietnamese: false,
    tokenReduce: false,
  });
  assert.equal(out.content, input);
  assert.equal(out.metadata.originalContent, input);
  assert.equal(estimateTokens("abcd"), 1);
});

test("createJaViCleaner exposes id", async () => {
  const cleaner = createJaViCleaner();
  assert.equal(cleaner.id, "cleaner-ja-vi");
  const cleaned = await cleaner.clean(doc("２０２４"));
  assert.match(cleaned.content, /2024/);
});
