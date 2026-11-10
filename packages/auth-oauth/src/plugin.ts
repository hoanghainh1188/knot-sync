import {
  ConfigError,
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { AUTH_OAUTH_PLUGIN_NAME } from "./constants.js";
import { createOauthAuthProvider } from "./provider.js";
import { parseAuthOauthSettings, type AuthOauthSettings } from "./settings.js";

export interface CreateAuthOauthPluginOptions {
  settings?: unknown;
  env?: NodeJS.ProcessEnv;
  jwksGetKey?: import("jose").JWTVerifyGetKey;
}

export function createAuthOauthPlugin(
  options: CreateAuthOauthPluginOptions = {},
): KnotSyncPlugin {
  return {
    name: AUTH_OAUTH_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      let settings: AuthOauthSettings;
      try {
        const raw =
          options.settings !== undefined ? options.settings : api.getPluginSettings();
        settings = parseAuthOauthSettings(raw);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(
          `Invalid "${AUTH_OAUTH_PLUGIN_NAME}" settings (${(err as Error).message || String(err)}). ` +
            `Fix ${AUTH_OAUTH_PLUGIN_NAME}: in the config, then retry.`,
        );
      }

      const env = options.env ?? process.env;
      // Always register so `plugins` lists mcp-auth. authenticate() rejects OAuth
      // until licensed; API key fallback still works via serveHttp.
      api.registerMcpAuthProvider(
        createOauthAuthProvider({
          settings,
          env,
          jwksGetKey: options.jwksGetKey,
        }),
      );
    },
  };
}

const defaultPlugin = createAuthOauthPlugin();
export default defaultPlugin;
