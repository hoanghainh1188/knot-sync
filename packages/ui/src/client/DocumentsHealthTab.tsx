import { useCallback, useEffect, useState } from "react";
import { t, type UiLocale } from "./i18n.js";
import type {
  DocumentsApiResponse,
  GuardRiskLevel,
  HealthSummaryApiResponse,
  SanitizedDocumentSummary,
} from "./types.js";

const PAGE_LIMIT = 20;

const RISK_LABEL_KEY: Record<GuardRiskLevel, string> = {
  none: "docsRiskNone",
  low: "docsRiskLow",
  medium: "docsRiskMedium",
  high: "docsRiskHigh",
};

interface DocumentsHealthTabProps {
  locale: UiLocale;
}

export function DocumentsHealthTab({ locale }: DocumentsHealthTabProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const [docsData, setDocsData] = useState<DocumentsApiResponse | null>(null);
  const [healthData, setHealthData] = useState<HealthSummaryApiResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    const res = await fetch("/api/health-summary");
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as HealthSummaryApiResponse;
    setHealthData(data);
  }, []);

  const loadDocuments = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (sourceFilter) params.set("sourceId", sourceFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (riskFilter) params.set("guardRisk", riskFilter);
    params.set("limit", String(PAGE_LIMIT));
    params.set("offset", String(offset));

    const res = await fetch(`/api/documents?${params.toString()}`);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as DocumentsApiResponse;
    setDocsData(data);
    setSelectedId((prev) => {
      if (prev && data.documents.some((d) => d.id === prev)) return prev;
      return data.documents[0]?.id ?? null;
    });
  }, [query, sourceFilter, typeFilter, riskFilter, offset]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([loadHealth(), loadDocuments()])
      .catch((err) => {
        if (active) setError(`${t(locale, "docsLoadError")}: ${(err as Error).message}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadHealth, loadDocuments, locale]);

  const selectedDoc: SanitizedDocumentSummary | null =
    docsData?.documents.find((d) => d.id === selectedId) ?? null;

  if (loading && !docsData && !healthData) {
    return <p className="status">{t(locale, "docsLoading")}</p>;
  }

  if (error) {
    return <p className="status err">{error}</p>;
  }

  if (docsData && !docsData.storeExists) {
    return (
      <div>
        <p className="context-banner">{t(locale, "docsBanner")}</p>
        <p className="empty">{t(locale, "docsNoStore")}</p>
      </div>
    );
  }

  const total = docsData?.total ?? 0;
  const startIdx = total === 0 ? 0 : offset + 1;
  const endIdx = Math.min(total, offset + (docsData?.documents.length ?? 0));
  const combinedIssues = [
    ...(healthData?.scanIssues ?? []).map((i) => ({ kind: "scan" as const, ...i })),
    ...(healthData?.runIssues ?? []).map((i) => ({ kind: "run" as const, ...i })),
  ];

  return (
    <div className="docs-health">
      <p className="context-banner">{t(locale, "docsBanner")}</p>

      <div className="toolbar docs-filters">
        <input
          type="search"
          className="search-input"
          value={query}
          placeholder={t(locale, "docsSearchPlaceholder")}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
        />
        <select
          aria-label={t(locale, "docsFilterAllSources")}
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t(locale, "docsFilterAllSources")}</option>
          {(docsData?.sources ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label={t(locale, "docsFilterAllTypes")}
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t(locale, "docsFilterAllTypes")}</option>
          {(docsData?.types ?? []).map((tp) => (
            <option key={tp} value={tp}>
              {tp}
            </option>
          ))}
        </select>
        <select
          aria-label={t(locale, "docsFilterAllRisks")}
          value={riskFilter}
          onChange={(e) => {
            setRiskFilter(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t(locale, "docsFilterAllRisks")}</option>
          {(["high", "medium", "low", "none"] as GuardRiskLevel[]).map((risk) => (
            <option key={risk} value={risk}>
              {t(locale, RISK_LABEL_KEY[risk])}
            </option>
          ))}
        </select>
      </div>

      <div className="docs-layout">
        <div className="panel">
          <div className="docs-list-header">
            <span className="status">
              {t(locale, "docsShowing")}: {startIdx}–{endIdx} / {total}
            </span>
            <div className="pagination">
              <button
                type="button"
                className="secondary"
                disabled={offset <= 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
              >
                {t(locale, "docsPrevPage")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={offset + PAGE_LIMIT >= total}
                onClick={() => setOffset(offset + PAGE_LIMIT)}
              >
                {t(locale, "docsNextPage")}
              </button>
            </div>
          </div>

          {!docsData || docsData.documents.length === 0 ? (
            <p className="empty">{t(locale, "docsEmpty")}</p>
          ) : (
            <div className="list">
              {docsData.documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={d.id === selectedDoc?.id ? "active doc-item" : "doc-item"}
                  onClick={() => setSelectedId(d.id)}
                >
                  <div className="doc-item-title">{d.title}</div>
                  <div className="doc-item-meta">
                    <span>
                      {d.sourceId} · {d.type}
                    </span>
                    <span className="doc-badges">
                      {d.piiCount > 0 ? (
                        <span className="pii-badge">PII: {d.piiCount}</span>
                      ) : null}
                      <span className={`risk-badge risk-${d.guardRisk}`}>
                        {t(locale, RISK_LABEL_KEY[d.guardRisk])}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          {!selectedDoc ? (
            <p className="empty">{t(locale, "docsSelectDoc")}</p>
          ) : (
            <div className="doc-detail">
              <h3>{selectedDoc.title}</h3>
              <p className="status">
                {selectedDoc.sourceId} · {selectedDoc.type} · {t(locale, "docsUpdatedAt")}:{" "}
                {selectedDoc.updatedAt}
              </p>

              <h4>{t(locale, "docsSnippet")}</h4>
              <pre className="snippet-box">{selectedDoc.snippet}</pre>

              <h4>{t(locale, "docsPiiFindings")}</h4>
              {selectedDoc.piiCount > 0 ? (
                <div>
                  <div className="pill-row">
                    {Object.entries(selectedDoc.piiByType).map(([rule, count]) => (
                      <span key={rule} className="pii-badge">
                        {rule}: {count}
                      </span>
                    ))}
                  </div>
                  <p className="status">{t(locale, "docsPiiReminder")}</p>
                </div>
              ) : (
                <p className="status">0</p>
              )}

              <h4>{t(locale, "docsGuardFindings")}</h4>
              <div className="pill-row">
                <span className={`risk-badge risk-${selectedDoc.guardRisk}`}>
                  {t(locale, RISK_LABEL_KEY[selectedDoc.guardRisk])}
                </span>
                {selectedDoc.guardTypes.map((rule) => (
                  <span key={rule} className="pill">
                    {rule}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {healthData ? (
        <section className="health-section">
          <h2>{t(locale, "healthHeading")}</h2>
          <div className="health-grid">
            {healthData.sources.map((src) => (
              <div key={src.sourceId} className="panel health-card">
                <h3>{src.sourceId}</h3>
                <dl className="health-metrics">
                  <div>
                    <dt>{t(locale, "healthFiles")}</dt>
                    <dd>{src.fileCount}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "healthDocs")}</dt>
                    <dd>{src.documentCount}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "healthDuplicates")}</dt>
                    <dd>{src.duplicateFiles}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "healthOldFiles")}</dt>
                    <dd>{src.oldFiles}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "healthEmptyFiles")}</dt>
                    <dd>{src.emptyFiles}</dd>
                  </div>
                  <div>
                    <dt>{t(locale, "healthScanIssues")}</dt>
                    <dd>{src.issues}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <h3>
            {t(locale, "healthScanIssues")} &amp; {t(locale, "healthRunIssues")} (
            {combinedIssues.length})
          </h3>
          {combinedIssues.length === 0 ? (
            <p className="status">{t(locale, "healthNoIssues")}</p>
          ) : (
            <div className="panel table-wrap">
              <table className="issues-table">
                <thead>
                  <tr>
                    <th>{t(locale, "sources")}</th>
                    <th>{t(locale, "issueCode")}</th>
                    <th>{t(locale, "issuePath")}</th>
                    <th>{t(locale, "issueMessage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedIssues.map((issue, idx) => (
                    <tr key={`${issue.kind}-${issue.path}-${idx}`}>
                      <td>
                        <span className={`pill kind-${issue.kind}`}>
                          {t(locale, issue.kind === "scan" ? "issueKindScan" : "issueKindRun")}
                        </span>{" "}
                        {issue.sourceId || "—"}
                      </td>
                      <td>
                        <code>{issue.code}</code>
                      </td>
                      <td>{issue.path}</td>
                      <td>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
