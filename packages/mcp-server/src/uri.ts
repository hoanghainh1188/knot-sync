export const SOURCES_URI = "knot://sources";

/** Build `knot://docs/{source}/{doc_id}` with encoded segments. */
export function documentUri(sourceId: string, docId: string): string {
  return `knot://docs/${encodeURIComponent(sourceId)}/${encodeURIComponent(docId)}`;
}

export interface ParsedDocUri {
  sourceId: string;
  docId: string;
}

/**
 * Parse `knot://docs/{source}/{doc_id}`.
 * Returns null when the URI is not a document resource.
 */
export function parseDocumentUri(uri: string): ParsedDocUri | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  if (parsed.protocol !== "knot:") return null;
  // URL for knot://docs/share/abc → hostname "docs", pathname "/share/abc"
  if (parsed.hostname !== "docs") return null;
  const parts = parsed.pathname.replace(/^\/+/, "").split("/");
  if (parts.length < 2) return null;
  const sourceId = decodeURIComponent(parts[0]!);
  const docId = decodeURIComponent(parts.slice(1).join("/"));
  if (!sourceId || !docId) return null;
  return { sourceId, docId };
}
