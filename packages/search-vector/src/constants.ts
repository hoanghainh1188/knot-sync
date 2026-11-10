export const SEARCH_VECTOR_PLUGIN_NAME = "search-vector";

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_SEARCH_VECTOR_LICENSE";

/** Accepted only in tests / local smoke — not a production key. */
export const SEARCH_VECTOR_TEST_LICENSE_SENTINEL = "knot-sync-search-vector-dev";

/** Default OpenAI-compatible base (Ollama). */
export const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

/** Default local embedding model name (operator may override). */
export const DEFAULT_MODEL = "nomic-embed-text";

export const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_MAX_CHARS = 8_000;

export const DEFAULT_LAZY_MAX_DOCS = 20;

export const DEFAULT_API_KEY_ENV = "KNOT_SYNC_SEARCH_VECTOR_API_KEY";

export const SEARCH_SIMILAR_TOOL_ID = "search_similar";
export const EMBED_DOCUMENTS_TOOL_ID = "embed_documents";
