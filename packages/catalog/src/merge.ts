import {
  emptyCatalog,
  emptyColumn,
  emptyTable,
  type CatalogColumn,
  type CatalogDocument,
  type CatalogLabel,
  type CatalogSourceEntry,
  type CatalogTable,
} from "./types.js";

function mergeLabel(existing: CatalogLabel, incoming: CatalogLabel, reviewed: boolean): CatalogLabel {
  if (reviewed) return { ...existing };
  return {
    ja: incoming.ja !== "" ? incoming.ja : existing.ja,
    vi: incoming.vi !== "" ? incoming.vi : existing.vi,
    en: incoming.en !== "" ? incoming.en : existing.en,
  };
}

function mergeColumn(existing: CatalogColumn | undefined, incoming: CatalogColumn): CatalogColumn {
  if (!existing) {
    return emptyColumn({ ...incoming, label: { ...incoming.label }, values: [...incoming.values] });
  }
  if (existing.reviewed) {
    // Keep reviewed fields; still allow adding empty new keys only via values merge? Spec: keep reviewed fields unchanged.
    return emptyColumn({
      ...existing,
      label: { ...existing.label },
      values: [...existing.values],
    });
  }
  return emptyColumn({
    label: mergeLabel(existing.label, incoming.label, false),
    description: incoming.description !== "" ? incoming.description : existing.description,
    type: incoming.type !== "" ? incoming.type : existing.type,
    values: incoming.values.length > 0 ? [...incoming.values] : [...existing.values],
    references: incoming.references ?? existing.references,
    pii: incoming.pii || existing.pii,
    expose: incoming.expose,
    reviewed: false,
  });
}

function mergeTable(existing: CatalogTable | undefined, incoming: CatalogTable): CatalogTable {
  if (!existing) {
    const columns: Record<string, CatalogColumn> = {};
    for (const [k, v] of Object.entries(incoming.columns)) {
      columns[k] = mergeColumn(undefined, v);
    }
    return emptyTable({
      label: { ...incoming.label },
      description: incoming.description,
      reviewed: incoming.reviewed,
      columns,
    });
  }
  const columns: Record<string, CatalogColumn> = { ...existing.columns };
  for (const [name, col] of Object.entries(incoming.columns)) {
    columns[name] = mergeColumn(columns[name], col);
  }
  if (existing.reviewed) {
    return emptyTable({
      label: { ...existing.label },
      description: existing.description,
      reviewed: true,
      columns,
    });
  }
  return emptyTable({
    label: mergeLabel(existing.label, incoming.label, false),
    description: incoming.description !== "" ? incoming.description : existing.description,
    reviewed: false,
    columns,
  });
}

function mergeSource(
  existing: CatalogSourceEntry | undefined,
  incoming: CatalogSourceEntry,
): CatalogSourceEntry {
  const tables: Record<string, CatalogTable> = { ...(existing?.tables ?? {}) };
  for (const [name, table] of Object.entries(incoming.tables)) {
    tables[name] = mergeTable(tables[name], table);
  }
  return { tables };
}

/**
 * Merge a newly generated draft into an existing catalog.
 * Entries with `reviewed: true` keep their reviewed fields unchanged.
 */
export function mergeCatalog(existing: CatalogDocument, draft: CatalogDocument): CatalogDocument {
  const base = existing.version === 1 ? existing : emptyCatalog();
  const sources: Record<string, CatalogSourceEntry> = { ...base.sources };
  for (const [id, src] of Object.entries(draft.sources)) {
    sources[id] = mergeSource(sources[id], src);
  }
  return { version: 1, sources };
}
