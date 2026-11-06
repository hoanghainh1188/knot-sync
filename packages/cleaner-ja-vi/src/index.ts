import {
  DEFAULT_CLEANING_CONFIG,
  PLUGIN_API_VERSION,
  type CleaningConfig,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { createJaViCleaner } from "./clean.js";

export {
  cleanDocument,
  createJaViCleaner,
} from "./clean.js";
export { convertDatesIso } from "./dates.js";
export {
  convertLegacyVietnamese,
  encodeTcvn3ForTest,
  encodeVniForTest,
} from "./legacy-vn.js";
export { convertWareki, parseKanjiNumeral } from "./wareki.js";
export { estimateTokens } from "./tokens.js";

/** Build the built-in plugin with settings from config `cleaning:`. */
export function createCleanerJaViPlugin(
  settings: CleaningConfig = DEFAULT_CLEANING_CONFIG,
): KnotSyncPlugin {
  const cleaner = createJaViCleaner(settings);
  return {
    name: "cleaner-ja-vi",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      api.registerCleaner(cleaner);
    },
  };
}

/** Default export uses all steps enabled (used when settings are not injected). */
const defaultPlugin = createCleanerJaViPlugin();
export default defaultPlugin;
