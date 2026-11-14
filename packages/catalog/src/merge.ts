import {
  emptyCatalog,
  emptyColumn,
  emptyLookupJoin,
  emptyTable,
  type CatalogColumn,
  type CatalogDocument,
  type CatalogLabel,
  type CatalogLookupJoin,
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

function cloneColumnMap(cols: Record<string, CatalogColumn>): Record<string, CatalogColumn> {
  const out: Record<string, CatalogColumn> = {};
  for (const [k, v] of Object.entries(cols)) {
    out[k] = emptyColumn({ ...v, label: { ...v.label }, values: [...v.values] });
  }
  return out;
}

function mergeLookupJoins(
  existingJoins: CatalogLookupJoin[] | undefined,
  incomingJoins: CatalogLookupJoin[] | undefined,
): CatalogLookupJoin[] | undefined {
  const byName = new Map<string, CatalogLookupJoin>();
  for (const j of existingJoins ?? []) {
    byName.set(
      j.name,
      emptyLookupJoin({
        ...j,
        columns: cloneColumnMap(j.columns),
        reviewed: j.reviewed === true,
      }),
    );
  }
  for (const inc of incomingJoins ?? []) {
    const prev = byName.get(inc.name);
    if (prev?.reviewed) {
      // Preserve reviewed lookupJoins verbatim.
      continue;
    }
    const mergedCols: Record<string, CatalogColumn> = { ...(prev?.columns ?? {}) };
    for (const [colName, col] of Object.entries(inc.columns)) {
      mergedCols[colName] = mergeColumn(mergedCols[colName], col);
    }
    byName.set(
      inc.name,
      emptyLookupJoin({
        name: inc.name,
        targetTable: inc.targetTable,
        localColumn: inc.localColumn,
        targetColumn: inc.targetColumn,
        columns: mergedCols,
        // Never auto-approve lookup joins during catalog merge.
        reviewed: false,
      }),
    );
  }
  if (byName.size === 0) return undefined;
  return [...byName.values()];
}

function mergeTable(existing: CatalogTable | undefined, incoming: CatalogTable): CatalogTable {
  if (!existing) {
    const columns: Record<string, CatalogColumn> = {};
    for (const [k, v] of Object.entries(incoming.columns)) {
      columns[k] = mergeColumn(undefined, v);
    }
    const lookupJoins = mergeLookupJoins(undefined, incoming.lookupJoins);
    return emptyTable({
      label: { ...incoming.label },
      description: incoming.description,
      reviewed: incoming.reviewed,
      columns,
      ...(lookupJoins ? { lookupJoins } : {}),
    });
  }
  const columns: Record<string, CatalogColumn> = { ...existing.columns };
  for (const [name, col] of Object.entries(incoming.columns)) {
    columns[name] = mergeColumn(columns[name], col);
  }
  const lookupJoins = mergeLookupJoins(existing.lookupJoins, incoming.lookupJoins);
  if (existing.reviewed) {
    return emptyTable({
      label: { ...existing.label },
      description: existing.description,
      reviewed: true,
      columns,
      ...(lookupJoins ? { lookupJoins } : {}),
    });
  }
  return emptyTable({
    label: mergeLabel(existing.label, incoming.label, false),
    description: incoming.description !== "" ? incoming.description : existing.description,
    reviewed: false,
    columns,
    ...(lookupJoins ? { lookupJoins } : {}),
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
