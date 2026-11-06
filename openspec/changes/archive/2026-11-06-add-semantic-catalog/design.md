# Design: add-semantic-catalog

## Context

SQL connectors and MCP `query_table` / `describe_table` exist; `CatalogSource`
in core is still an `{ id }` stub. See proposal.md for motivation. Constraints:
read-only customer sources/DBs; no KnotSync telemetry; no LLM in free core;
`exceljs` (MIT) only new Excel dependency; Japanese/Vietnamese first-class.

**Network note:** DB introspection/sampling uses the same intentional
customer DB access as `add-sql-source`. Catalog Excel/dictionary files are
local paths only.

## Goals / Non-Goals

**Goals**

- `packages/catalog` load/merge/write YAML; dictionaries; optional Excel import.
- CLI `describe` for SQL sources; preserve `reviewed: true`.
- Executable `CatalogSource`; MCP enrichment + business-name + enum checks.
- Config `catalog` section with safe defaults.

**Non-Goals**

- LLM suggestions; catalog for fs documents; writing definition Excel or DB;
  auto-`reviewed: true`; Web UI review screen (v0.2).

## Decisions

### 1. Catalog file shape

Single YAML document, default path `<configDir>/knot-sync.catalog.yaml`:

```yaml
version: 1
sources:
  erp:
    tables:
      受注:
        label: { ja: "受注", vi: "", en: "Orders" }
        description: ""
        reviewed: false
        columns:
          TKSK_CD:
            label: { ja: "得意先コード", vi: "", en: "" }
            description: ""
            type: "varchar"
            values: []          # distinct / enum hints
            pii: false
            expose: true
            reviewed: false
```

- Physical names are map keys (Unicode OK).
- `values` stores short distinct lists only—never full sample dumps.
- Unknown top-level keys → fail load (strict, like other config sections).

**Alternative:** SQLite catalog store. Rejected for v0.1—YAML is human-reviewable
and matches the roadmap filename.

### 2. Package layout

`packages/catalog` (`@hoanghainh/knot-sync-catalog`):

| Module | Role |
|---|---|
| `types` / schema | Catalog types + parse/validate |
| `merge` | Merge rules: skip overwrite when `reviewed: true` |
| `dictionaries` | Built-in romaji + VN abbreviation maps |
| `excel` | Read definition workbook via `exceljs` |
| `describe` | Orchestrate introspect → sample → sources → merge → write |

CLI depends on catalog; catalog may depend on core types + connector-sql
introspection helpers (or accept injected introspect/sample functions to avoid
cycles—prefer thin interfaces in core or catalog accepting callbacks from CLI).

### 3. Describe pipeline

For each SQL source in config:

1. Connect read-only (reuse connector-sql).
2. For each allow-listed table/column: introspect type/nullability.
3. Optional bounded distinct sample: `SELECT DISTINCT col … LIMIT N`
   (N small, e.g. 50; skip wide text/blob; skip if column tagged pii in
   existing catalog). Never write samples to customer DB.
4. Run registered `CatalogSource.suggest` (built-in dict, optional customer
   dict file, optional Excel) → draft fields.
5. Load existing YAML if present; merge; write atomically (temp + rename).

Exit 1 on config/DB/Excel-required failures with “what to do next”.

### 4. CatalogSource API

Widen stub to roughly:

```ts
export interface CatalogSuggestInput {
  sourceId: string;
  table: string;
  column: string;
  dbType?: string;
  sampleValues?: string[];
}

export interface CatalogSuggestion {
  label?: { ja?: string; vi?: string; en?: string };
  description?: string;
  values?: string[];
  pii?: boolean;
}

export interface CatalogSource {
  id: string;
  suggest(input: CatalogSuggestInput): CatalogSuggestion | Promise<CatalogSuggestion>;
}
```

Built-ins: `dict-romaji`, `dict-vi`, optional `dict-customer`, `excel-definition`.
Compose with last-writer-wins for unreviewed fields; Excel overrides dict when
both match; reviewed entries ignore all suggestions.

### 5. Dictionaries

Ship compact maps in-package (roadmap examples: CD→コード, TKSK→得意先, ma→mã,
kh→khách hàng, …). Split physical names on `_` / camelCase; expand tokens;
join into suggested labels. Customer dictionary YAML/JSON: token → {ja,vi,en}.

### 6. Definition Excel

Configurable mapping defaults, e.g.:

```yaml
catalog:
  definition_excel: ./defs/項目定義.xlsx
  definition_mapping:
    sheet: "項目"
    physical: "物理名"
    label_ja: "論理名"
    label_vi: "Tên nghiệp vụ"
    description: "説明"
```

Build minimal `.xlsx` in tests with exceljs (no customer 定義書 committed).
Optional path missing → warn/skip; configured path unreadable → fail.

### 7. MCP integration

On `serve`: load catalog once. Enrich `describe_table` / schema JSON with labels.
For `query_table`:

1. Resolve filter column: physical match OR unique label match among table columns.
2. Confirm allow-list.
3. If `values.length > 0`, every filter value must be in the set (eq/in); range/
   contains skip enum or only check endpoints for eq—**decision: enum applies to
   equals and `in` only**; range/contains unchanged.
4. Parameterized query as today; framing unchanged.

### 8. Config

Add optional `catalog` section (keys in config delta). Relative paths from
config directory. Do not put secrets in catalog YAML.

## Risks / Trade-offs

- [Ambiguous business labels] → Reject with conflict error; document exact-match.
- [Distinct sampling cost on huge tables] → Cap N; skip TEXT/BLOB; prefer stats.
- [Excel layout variance] → Mapping config; fixture proves one happy path.
- [YAML merge races] → Single-writer CLI; atomic write; no multi-process lock in v0.1.

## Migration Plan

- New optional files/commands; existing configs work unchanged.
- Rollback: remove `catalog` package usage / ignore catalog file; SQL MCP
  physical-name behavior remains.

## Open Questions

None material for v0.1; sample workbook built in tests satisfies roadmap
“needs sample テーブル定義書”.
