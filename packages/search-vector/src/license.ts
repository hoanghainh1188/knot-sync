import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  SEARCH_VECTOR_PLUGIN_NAME,
  SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { SearchVectorSettings } from "./settings.js";

export function isValidSearchVectorLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

export function licenseMissingMessage(licenseEnv: string): string {
  return (
    `Search-vector license missing or invalid. ` +
    `Set ${licenseEnv} or ${SEARCH_VECTOR_PLUGIN_NAME}.licenseKey ` +
    `(tests may use ${SEARCH_VECTOR_TEST_LICENSE_SENTINEL}), then retry.`
  );
}

export function resolveSearchVectorLicense(
  settings: SearchVectorSettings,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  return isValidSearchVectorLicense(value) ? value : undefined;
}

export function assertSearchVectorLicense(
  settings: SearchVectorSettings,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!resolveSearchVectorLicense(settings, env)) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv));
  }
}
