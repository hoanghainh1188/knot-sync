export const GUARD_LLM_PLUGIN_NAME = "guard-llm";

/** DocumentEnricher id registered by this plugin. */
export const GUARD_LLM_ENRICHER_ID = "guard-llm";

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_GUARD_LLM_LICENSE";

/** Accepted only in tests / local smoke — not a production key. */
export const GUARD_LLM_TEST_LICENSE_SENTINEL = "knot-sync-guard-llm-dev";

/** Default OpenAI-compatible base (Ollama). */
export const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

/** Default local model name (operator may override). */
export const DEFAULT_MODEL = "llama3.2";

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Cap characters sent to the model (truncate from the start of content). */
export const DEFAULT_MAX_CHARS = 8_000;

/** Optional env holding a local API key for inference servers that require one. */
export const DEFAULT_API_KEY_ENV = "KNOT_SYNC_GUARD_LLM_API_KEY";
