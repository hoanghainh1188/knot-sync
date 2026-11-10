export const CATALOG_LLM_PLUGIN_NAME = "catalog-llm";

/** CatalogSource id registered by this plugin (describe fill-empty key). */
export const CATALOG_LLM_SOURCE_ID = "catalog-llm";

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_CATALOG_LLM_LICENSE";

/** Accepted only in tests / local smoke — not a production key. */
export const CATALOG_LLM_TEST_LICENSE_SENTINEL = "knot-sync-catalog-llm-dev";

/** Default OpenAI-compatible base (Ollama). */
export const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

/** Default local model name (operator may override). */
export const DEFAULT_MODEL = "llama3.2";

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Optional env holding a local API key for inference servers that require one. */
export const DEFAULT_API_KEY_ENV = "KNOT_SYNC_CATALOG_LLM_API_KEY";
