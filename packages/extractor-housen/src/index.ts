import {
  ConfigError,
  PLUGIN_API_VERSION,
  type Extractor,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import {
  HOUSEN_EXTRACTOR_ID,
  HOUSEN_EXTENSIONS,
  HOUSEN_PLUGIN_NAME,
  HOUSEN_TEST_LICENSE_SENTINEL,
  NOT_FORM_CODE,
} from "./constants.js";
import { extractHousenFile } from "./extract.js";
import { parseHousenSettings, type HousenSettings } from "./settings.js";

export {
  HOUSEN_EXTRACTOR_ID,
  HOUSEN_EXTENSIONS,
  HOUSEN_PLUGIN_NAME,
  HOUSEN_TEST_LICENSE_SENTINEL,
  NOT_FORM_CODE,
  DEFAULT_FORM_THRESHOLD,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_LICENSE_ENV,
} from "./constants.js";
export { parseHousenSettings, type HousenSettings } from "./settings.js";
export { checkHousenLicense, isValidHousenLicense } from "./license.js";
export {
  scoreFormLikeness,
  worksheetToGrid,
  workbookLooksLikeForm,
  looksLikeLabel,
  JP_FORM_LABELS,
} from "./detect.js";
export { emitFormDocumentParts } from "./emit.js";
export { extractHousenFile, loadSheetGrids } from "./extract.js";
export { buildFormXlsx, buildDenseTableXlsx } from "./fixtures.js";

export interface CreateHousenPluginOptions {
  settings?: unknown;
  env?: NodeJS.ProcessEnv;
}

export function createHousenPlugin(
  options: CreateHousenPluginOptions = {},
): KnotSyncPlugin {
  return {
    name: HOUSEN_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      let settings: HousenSettings;
      try {
        const raw =
          options.settings !== undefined ? options.settings : api.getPluginSettings();
        settings = parseHousenSettings(raw);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(
          `Invalid "extractor-housen" settings (${(err as Error).message || String(err)}). ` +
            `Fix extractor-housen: in the config, then retry.`,
        );
      }

      const extractor: Extractor = {
        id: HOUSEN_EXTRACTOR_ID,
        extensions: [...HOUSEN_EXTENSIONS],
        extract: (file, ctx) =>
          extractHousenFile(file, ctx, {
            settings,
            env: options.env,
          }),
      };
      api.registerExtractor(extractor);
    },
  };
}

const defaultPlugin = createHousenPlugin();
export default defaultPlugin;
