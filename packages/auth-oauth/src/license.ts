import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  AUTH_OAUTH_PLUGIN_NAME,
  OAUTH_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { AuthOauthSettings } from "./settings.js";

export function isValidOauthLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

export function licenseMissingMessage(licenseEnv: string): string {
  return (
    `OAuth license missing or invalid. ` +
    `Set ${licenseEnv} or ${AUTH_OAUTH_PLUGIN_NAME}.licenseKey ` +
    `(tests may use ${OAUTH_TEST_LICENSE_SENTINEL}), then retry.`
  );
}

export function resolveOauthLicense(
  settings: AuthOauthSettings,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  return isValidOauthLicense(value) ? value : undefined;
}

export function assertOauthLicense(
  settings: AuthOauthSettings,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!resolveOauthLicense(settings, env)) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv));
  }
}
