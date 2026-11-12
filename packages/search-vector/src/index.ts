export {
  SEARCH_VECTOR_PLUGIN_NAME,
  SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_LAZY_MAX_DOCS,
  DEFAULT_LICENSE_ENV,
  DEFAULT_MAX_CHARS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  SEARCH_SIMILAR_TOOL_ID,
  EMBED_DOCUMENTS_TOOL_ID,
} from "./constants.js";
export {
  assertSearchVectorLicense,
  isValidSearchVectorLicense,
  licenseMissingMessage,
  resolveSearchVectorLicense,
  verifySearchVectorLicense,
  type SearchVectorLicenseCheckOptions,
} from "./license.js";
export {
  parseSearchVectorSettings,
  type SearchVectorSettings,
} from "./settings.js";
export {
  SearchVectorSoftFail,
  embedText,
  type FetchLike,
  type EmbedTextOptions,
} from "./client.js";
export { cosineSimilarity } from "./cosine.js";
export {
  contentHashForDocument,
  ensureEmbeddingsSchema,
  getEmbedding,
  listEmbeddings,
  upsertEmbedding,
  type EmbeddingRow,
} from "./embeddings-store.js";
export {
  asStore,
  embedAllDocuments,
  embedDocument,
  formatSimilarHits,
  searchSimilar,
  type SearchVectorRuntime,
  type SimilarHit,
} from "./service.js";
export {
  createSearchVectorPlugin,
  type CreateSearchVectorPluginOptions,
} from "./plugin.js";
export { default } from "./plugin.js";
