export {
  CATALOG_LLM_PLUGIN_NAME,
  CATALOG_LLM_SOURCE_ID,
  CATALOG_LLM_TEST_LICENSE_SENTINEL,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_LICENSE_ENV,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
} from "./constants.js";
export {
  assertCatalogLlmLicense,
  isValidCatalogLlmLicense,
  licenseMissingMessage,
  resolveCatalogLlmLicense,
  verifyCatalogLlmLicense,
  type CatalogLlmLicenseCheckOptions,
} from "./license.js";
export {
  parseCatalogLlmSettings,
  type CatalogLlmSettings,
} from "./settings.js";
export {
  CatalogLlmSoftFail,
  suggestViaChat,
  type FetchLike,
  type SuggestViaChatOptions,
} from "./client.js";
export {
  createCatalogLlmSource,
  type CreateCatalogLlmSourceOptions,
} from "./source.js";
export {
  createCatalogLlmPlugin,
  type CreateCatalogLlmPluginOptions,
} from "./plugin.js";
export { default } from "./plugin.js";
