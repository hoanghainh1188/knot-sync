import { useCallback, useEffect, useMemo, useState } from "react";
import { filterColumnNames } from "../chrome-i18n.js";
import { resolveUiLocale, t, type UiLocale } from "./i18n.js";
import type { CatalogColumn, CatalogDocument } from "./types.js";

export function App() {
  const locale: UiLocale = useMemo(
    () => resolveUiLocale(typeof window !== "undefined" ? window.location.search : ""),
    [],
  );
  const [doc, setDoc] = useState<CatalogDocument | null>(null);
  const [loadOk, setLoadOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);
  const [columnName, setColumnName] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoadOk(false);
    try {
      const res = await fetch("/api/catalog");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as CatalogDocument;
      setDoc(data);
      setLoadOk(true);
      const sources = Object.keys(data.sources);
      if (sources[0]) {
        setSourceId(sources[0]);
        const tables = Object.keys(data.sources[sources[0]]!.tables);
        if (tables[0]) {
          setTableName(tables[0]);
          const cols = Object.keys(data.sources[sources[0]]!.tables[tables[0]]!.columns);
          setColumnName(cols[0] ?? null);
        }
      }
    } catch (err) {
      setError(`${t(locale, "loadError")}: ${(err as Error).message}`);
      setDoc(null);
      setLoadOk(false);
    }
  }, [locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceIds = useMemo(() => (doc ? Object.keys(doc.sources) : []), [doc]);
  const tableNames = useMemo(() => {
    if (!doc || !sourceId) return [];
    return Object.keys(doc.sources[sourceId]?.tables ?? {});
  }, [doc, sourceId]);
  const columnNames = useMemo(() => {
    if (!doc || !sourceId || !tableName) return [];
    const cols = doc.sources[sourceId]?.tables[tableName]?.columns ?? {};
    return filterColumnNames(cols, unreviewedOnly);
  }, [doc, sourceId, tableName, unreviewedOnly]);

  const column: CatalogColumn | null =
    doc && sourceId && tableName && columnName
      ? (doc.sources[sourceId]?.tables[tableName]?.columns[columnName] ?? null)
      : null;

  function updateColumn(patch: Partial<CatalogColumn>) {
    if (!doc || !sourceId || !tableName || !columnName || !column) return;
    const next: CatalogDocument = structuredClone(doc);
    const col = next.sources[sourceId]!.tables[tableName]!.columns[columnName]!;
    Object.assign(col, patch);
    if (patch.label) col.label = { ...col.label, ...patch.label };
    setDoc(next);
    setStatus("");
  }

  async function save() {
    if (!doc || !loadOk) return;
    setSaving(true);
    setStatus(t(locale, "saving"));
    try {
      const res = await fetch("/api/catalog", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || String(res.status));
      }
      setStatus(t(locale, "saved"));
    } catch (err) {
      setStatus(`${t(locale, "saveError")}: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!doc && !error) {
    return (
      <div className="app">
        <p>{t(locale, "loading")}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>{t(locale, "title")}</h1>
        <p>{t(locale, "subtitle")}</p>
      </header>

      {error ? <p className="status err">{error}</p> : null}

      <div className="toolbar">
        <label>
          <input
            type="checkbox"
            checked={unreviewedOnly}
            onChange={(e) => setUnreviewedOnly(e.target.checked)}
          />{" "}
          {t(locale, "filterUnreviewed")}
        </label>
        <button
          className="primary"
          type="button"
          disabled={saving || !doc || !loadOk}
          onClick={() => void save()}
        >
          {t(locale, "save")}
        </button>
        {status ? (
          <span className={`status ${status === t(locale, "saved") ? "ok" : ""}`}>{status}</span>
        ) : null}
      </div>

      {sourceIds.length === 0 ? (
        <p className="empty">{t(locale, "empty")}</p>
      ) : (
        <div className="layout">
          <div className="panel">
            <h2>{t(locale, "sources")}</h2>
            <div className="list">
              {sourceIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={id === sourceId ? "active" : ""}
                  onClick={() => {
                    setSourceId(id);
                    const tables = Object.keys(doc!.sources[id]!.tables);
                    setTableName(tables[0] ?? null);
                    const cols = tables[0]
                      ? Object.keys(doc!.sources[id]!.tables[tables[0]]!.columns)
                      : [];
                    setColumnName(cols[0] ?? null);
                  }}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{t(locale, "tables")}</h2>
            <div className="list">
              {tableNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={name === tableName ? "active" : ""}
                  onClick={() => {
                    setTableName(name);
                    const cols = Object.keys(doc!.sources[sourceId!]!.tables[name]!.columns);
                    setColumnName(cols[0] ?? null);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>{t(locale, "columns")}</h2>
            <div className="list">
              {columnNames.map((name) => {
                const c = doc!.sources[sourceId!]!.tables[tableName!]!.columns[name]!;
                return (
                  <button
                    key={name}
                    type="button"
                    className={name === columnName ? "active" : ""}
                    onClick={() => setColumnName(name)}
                  >
                    {name}
                    <span className={`badge ${c.reviewed ? "" : "need"}`}>
                      {c.reviewed ? t(locale, "reviewedBadge") : t(locale, "unreviewedBadge")}
                    </span>
                  </button>
                );
              })}
            </div>

            {column && columnName ? (
              <div className="form">
                <p>
                  <strong>{t(locale, "physical")}:</strong> {columnName}
                </p>
                <label htmlFor="label-ja">{t(locale, "labelJa")}</label>
                <input
                  id="label-ja"
                  type="text"
                  value={column.label.ja}
                  onChange={(e) =>
                    updateColumn({ label: { ...column.label, ja: e.target.value } })
                  }
                />
                <label htmlFor="label-vi">{t(locale, "labelVi")}</label>
                <input
                  id="label-vi"
                  type="text"
                  value={column.label.vi}
                  onChange={(e) =>
                    updateColumn({ label: { ...column.label, vi: e.target.value } })
                  }
                />
                <label htmlFor="label-en">{t(locale, "labelEn")}</label>
                <input
                  id="label-en"
                  type="text"
                  value={column.label.en}
                  onChange={(e) =>
                    updateColumn({ label: { ...column.label, en: e.target.value } })
                  }
                />
                <label htmlFor="desc">{t(locale, "description")}</label>
                <textarea
                  id="desc"
                  value={column.description}
                  onChange={(e) => updateColumn({ description: e.target.value })}
                />
                <label htmlFor="values">{t(locale, "values")}</label>
                <input
                  id="values"
                  type="text"
                  value={column.values.join(", ")}
                  onChange={(e) =>
                    updateColumn({
                      values: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <div className="checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={column.pii}
                      onChange={(e) => updateColumn({ pii: e.target.checked })}
                    />{" "}
                    {t(locale, "pii")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={column.expose}
                      onChange={(e) => updateColumn({ expose: e.target.checked })}
                    />{" "}
                    {t(locale, "expose")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={column.reviewed}
                      onChange={(e) => updateColumn({ reviewed: e.target.checked })}
                    />{" "}
                    {t(locale, "reviewed")}
                  </label>
                </div>
              </div>
            ) : (
              <p className="empty">{t(locale, "selectColumn")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
