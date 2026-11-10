import type {
  CatalogSource,
  CatalogSuggestInput,
  CatalogSuggestion,
} from "@hoanghainh/knot-sync-core";
import {
  suggestFromCustomerDict,
  suggestFromRomaji,
  suggestFromVietnamese,
  type CustomerDict,
} from "./dictionaries.js";
import type { DefinitionIndex } from "./excel.js";

function labelSuggestion(label: {
  ja: string;
  vi: string;
  en: string;
}): CatalogSuggestion {
  const out: CatalogSuggestion = { label: {} };
  if (label.ja) out.label!.ja = label.ja;
  if (label.vi) out.label!.vi = label.vi;
  if (label.en) out.label!.en = label.en;
  if (!out.label!.ja && !out.label!.vi && !out.label!.en) {
    return {};
  }
  return out;
}

export function createRomajiCatalogSource(): CatalogSource {
  return {
    id: "dict-romaji",
    suggest(input: CatalogSuggestInput): CatalogSuggestion {
      return labelSuggestion(suggestFromRomaji(input.column));
    },
  };
}

export function createVietnameseCatalogSource(): CatalogSource {
  return {
    id: "dict-vi",
    suggest(input: CatalogSuggestInput): CatalogSuggestion {
      return labelSuggestion(suggestFromVietnamese(input.column));
    },
  };
}

export function createCustomerDictCatalogSource(dict: CustomerDict): CatalogSource {
  return {
    id: "dict-customer",
    suggest(input: CatalogSuggestInput): CatalogSuggestion {
      return labelSuggestion(suggestFromCustomerDict(input.column, dict));
    },
  };
}

export function createExcelDefinitionCatalogSource(index: DefinitionIndex): CatalogSource {
  return {
    id: "excel-definition",
    suggest(input: CatalogSuggestInput): CatalogSuggestion {
      const hit =
        index.get(input.column) ??
        index.get(input.column.toLowerCase()) ??
        index.get(`${input.table}.${input.column}`);
      if (!hit) return {};
      const suggestion: CatalogSuggestion = {};
      if (hit.label.ja || hit.label.vi || hit.label.en) {
        suggestion.label = {};
        if (hit.label.ja) suggestion.label.ja = hit.label.ja;
        if (hit.label.vi) suggestion.label.vi = hit.label.vi;
        if (hit.label.en) suggestion.label.en = hit.label.en;
      }
      if (hit.description) suggestion.description = hit.description;
      return suggestion;
    },
  };
}

/** Apply suggestions in order; later non-empty fields overwrite earlier ones. */
export function applySuggestions(
  sources: CatalogSource[],
  input: CatalogSuggestInput,
): CatalogSuggestion {
  const out: CatalogSuggestion = { label: {} };
  for (const source of sources) {
    const s = source.suggest(input);
    // sync only — async sources can be awaited by caller via Promise.resolve
    if (s instanceof Promise) {
      throw new Error(
        `CatalogSource "${source.id}" returned a Promise; use applySuggestionsAsync.`,
      );
    }
    if (s.label) {
      if (s.label.ja) out.label!.ja = s.label.ja;
      if (s.label.vi) out.label!.vi = s.label.vi;
      if (s.label.en) out.label!.en = s.label.en;
    }
    if (s.description) out.description = s.description;
    if (s.values && s.values.length > 0) out.values = [...s.values];
    if (s.pii !== undefined) out.pii = s.pii;
  }
  if (!out.label?.ja && !out.label?.vi && !out.label?.en) {
    delete out.label;
  }
  return out;
}

export async function applySuggestionsAsync(
  sources: CatalogSource[],
  input: CatalogSuggestInput,
): Promise<CatalogSuggestion> {
  const out: CatalogSuggestion = { label: {} };
  for (const source of sources) {
    const s = await source.suggest(input);
    if (s.label) {
      if (s.label.ja) out.label!.ja = s.label.ja;
      if (s.label.vi) out.label!.vi = s.label.vi;
      if (s.label.en) out.label!.en = s.label.en;
    }
    if (s.description) out.description = s.description;
    if (s.values && s.values.length > 0) out.values = [...s.values];
    if (s.pii !== undefined) out.pii = s.pii;
  }
  if (!out.label?.ja && !out.label?.vi && !out.label?.en) {
    delete out.label;
  }
  return out;
}

/** True when no ja/vi/en label is present. */
export function suggestionLabelsEmpty(suggestion: CatalogSuggestion): boolean {
  return !suggestion.label?.ja && !suggestion.label?.vi && !suggestion.label?.en;
}

/**
 * Merge `fill` into `base` only for empty fields (labels + description).
 * Does not touch values; `pii` fills only when base has no pii yet.
 */
export function mergeFillEmpty(
  base: CatalogSuggestion,
  fill: CatalogSuggestion,
): CatalogSuggestion {
  const out: CatalogSuggestion = {
    label: { ...(base.label ?? {}) },
    description: base.description,
    values: base.values ? [...base.values] : undefined,
    pii: base.pii,
  };
  if (fill.label) {
    if (!out.label!.ja && fill.label.ja) out.label!.ja = fill.label.ja;
    if (!out.label!.vi && fill.label.vi) out.label!.vi = fill.label.vi;
    if (!out.label!.en && fill.label.en) out.label!.en = fill.label.en;
  }
  if (!out.description && fill.description) out.description = fill.description;
  if (out.pii === undefined && fill.pii !== undefined) out.pii = fill.pii;
  if (!out.label?.ja && !out.label?.vi && !out.label?.en) {
    delete out.label;
  }
  return out;
}

/**
 * Apply overwrite sources first, then fill-empty sources only when labels are blank.
 * Used so paid local-LLM sources do not overwrite dictionary/Excel labels.
 * If any label is already set, fill-empty sources are skipped entirely (including
 * description/pii) — matching the “LLM only for blank columns” product rule.
 */
export async function applySuggestionsWithFillEmpty(
  overwriteSources: CatalogSource[],
  fillEmptySources: CatalogSource[],
  input: CatalogSuggestInput,
): Promise<CatalogSuggestion> {
  let out = await applySuggestionsAsync(overwriteSources, input);
  if (!suggestionLabelsEmpty(out) || fillEmptySources.length === 0) {
    return out;
  }
  for (const source of fillEmptySources) {
    const fill = await source.suggest(input);
    out = mergeFillEmpty(out, fill);
  }
  return out;
}
