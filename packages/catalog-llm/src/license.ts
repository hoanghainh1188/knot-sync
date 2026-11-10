import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  CATALOG_LLM_PLUGIN_NAME,
  CATALOG_LLM_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { CatalogLlmSettings } from "./settings.js";

export function isValidCatalogLlmLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

export function licenseMissingMessage(licenseEnv: string): string {
  return (
    `Catalog LLM license missing or invalid. ` +
    `Set ${licenseEnv} or ${CATALOG_LLM_PLUGIN_NAME}.licenseKey ` +
    `(tests may use ${CATALOG_LLM_TEST_LICENSE_SENTINEL}), then retry.`
  );
}

export function resolveCatalogLlmLicense(
  settings: CatalogLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  return isValidCatalogLlmLicense(value) ? value : undefined;
}

export function assertCatalogLlmLicense(
  settings: CatalogLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!resolveCatalogLlmLicense(settings, env)) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv));
  }
}
