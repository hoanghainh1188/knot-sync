import {
  ConfigError,
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { CATALOG_LLM_PLUGIN_NAME } from "./constants.js";
import { parseCatalogLlmSettings, type CatalogLlmSettings } from "./settings.js";
import { createCatalogLlmSource, type CreateCatalogLlmSourceOptions } from "./source.js";

export interface CreateCatalogLlmPluginOptions {
  settings?: unknown;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: CreateCatalogLlmSourceOptions["fetchImpl"];
  onSoftFail?: CreateCatalogLlmSourceOptions["onSoftFail"];
}

export function createCatalogLlmPlugin(
  options: CreateCatalogLlmPluginOptions = {},
): KnotSyncPlugin {
  return {
    name: CATALOG_LLM_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      let settings: CatalogLlmSettings;
      try {
        const raw =
          options.settings !== undefined ? options.settings : api.getPluginSettings();
        settings = parseCatalogLlmSettings(raw);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(
          `Invalid "${CATALOG_LLM_PLUGIN_NAME}" settings (${(err as Error).message || String(err)}). ` +
            `Fix ${CATALOG_LLM_PLUGIN_NAME}: in the config, then retry.`,
        );
      }

      api.registerCatalogSource(
        createCatalogLlmSource({
          settings,
          env: options.env ?? process.env,
          fetchImpl: options.fetchImpl,
          onSoftFail: options.onSoftFail,
        }),
      );
    },
  };
}

const defaultPlugin = createCatalogLlmPlugin();
export default defaultPlugin;
