import {
  ConfigError,
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { GUARD_LLM_PLUGIN_NAME } from "./constants.js";
import { createGuardLlmEnricher, type CreateGuardLlmEnricherOptions } from "./enricher.js";
import { parseGuardLlmSettings, type GuardLlmSettings } from "./settings.js";

export interface CreateGuardLlmPluginOptions {
  settings?: unknown;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: CreateGuardLlmEnricherOptions["fetchImpl"];
  onSoftFail?: CreateGuardLlmEnricherOptions["onSoftFail"];
}

export function createGuardLlmPlugin(
  options: CreateGuardLlmPluginOptions = {},
): KnotSyncPlugin {
  return {
    name: GUARD_LLM_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      let settings: GuardLlmSettings;
      try {
        const raw =
          options.settings !== undefined ? options.settings : api.getPluginSettings();
        settings = parseGuardLlmSettings(raw);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(
          `Invalid "${GUARD_LLM_PLUGIN_NAME}" settings (${(err as Error).message || String(err)}). ` +
            `Fix ${GUARD_LLM_PLUGIN_NAME}: in the config, then retry.`,
        );
      }

      api.registerDocumentEnricher(
        createGuardLlmEnricher({
          settings,
          env: options.env ?? process.env,
          fetchImpl: options.fetchImpl,
          onSoftFail: options.onSoftFail,
        }),
      );
    },
  };
}

const defaultPlugin = createGuardLlmPlugin();
export default defaultPlugin;
