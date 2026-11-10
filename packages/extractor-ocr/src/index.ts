import {
  ConfigError,
  PLUGIN_API_VERSION,
  type Extractor,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import {
  OCR_EXTRACTOR_ID,
  OCR_EXTENSIONS,
  OCR_PLUGIN_NAME,
  OCR_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { DockerRunner } from "./docker.js";
import { defaultDockerRunner } from "./docker.js";
import { extractOcrFile } from "./extract.js";
import { parseOcrSettings, type OcrSettings } from "./settings.js";

export {
  OCR_EXTRACTOR_ID,
  OCR_EXTENSIONS,
  OCR_PLUGIN_NAME,
  OCR_TEST_LICENSE_SENTINEL,
  DEFAULT_DOCLING_IMAGE,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_LICENSE_ENV,
} from "./constants.js";
export { parseOcrSettings, type OcrSettings } from "./settings.js";
export {
  checkOcrLicense,
  isValidOcrLicense,
} from "./license.js";
export {
  defaultDockerRunner,
  type DockerRunner,
  type DockerRunInput,
  type DockerRunResult,
} from "./docker.js";
export { extractOcrFile } from "./extract.js";

export interface CreateOcrPluginOptions {
  /** Override settings (otherwise read via api.getPluginSettings() at register). */
  settings?: unknown;
  /** Inject Docker runner (tests mock this; production uses docker CLI). */
  dockerRunner?: DockerRunner;
  /** Env for license lookup (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
}

export function createOcrPlugin(options: CreateOcrPluginOptions = {}): KnotSyncPlugin {
  return {
    name: OCR_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      let settings: OcrSettings;
      try {
        const raw =
          options.settings !== undefined ? options.settings : api.getPluginSettings();
        settings = parseOcrSettings(raw);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(
          `Invalid "extractor-ocr" settings (${(err as Error).message || String(err)}). ` +
            `Fix extractor-ocr: in the config, then retry.`,
        );
      }

      const extractor: Extractor = {
        id: OCR_EXTRACTOR_ID,
        extensions: [...OCR_EXTENSIONS],
        extract: (file, ctx) =>
          extractOcrFile(file, ctx, {
            settings,
            dockerRunner: options.dockerRunner ?? defaultDockerRunner,
            env: options.env,
          }),
      };
      api.registerExtractor(extractor);
    },
  };
}

const defaultPlugin = createOcrPlugin();
export default defaultPlugin;
