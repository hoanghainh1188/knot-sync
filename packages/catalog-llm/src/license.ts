import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type LicenseVerificationResult,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  CATALOG_LLM_PLUGIN_NAME,
  CATALOG_LLM_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { CatalogLlmSettings } from "./settings.js";

export type CatalogLlmLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

export function isValidCatalogLlmLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: CatalogLlmLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: CATALOG_LLM_PLUGIN_NAME,
    testSentinel: CATALOG_LLM_TEST_LICENSE_SENTINEL,
    licenseKey: value,
    licenseEnv: "",
    env,
    ...options,
  }).valid;
}

export function licenseMissingMessage(
  licenseEnv: string,
  failure?: Pick<LicenseVerificationFailure, "reason" | "detail">,
): string {
  return formatLicenseFailureMessage({
    label: "Catalog LLM",
    pluginId: CATALOG_LLM_PLUGIN_NAME,
    licenseEnv,
    reason: failure?.reason,
    detail: failure?.detail,
  });
}

export function verifyCatalogLlmLicense(
  settings: CatalogLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: CatalogLlmLicenseCheckOptions = {},
): LicenseVerificationResult {
  return resolveAndVerifyPluginLicense({
    pluginId: CATALOG_LLM_PLUGIN_NAME,
    testSentinel: CATALOG_LLM_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
}

export function resolveCatalogLlmLicense(
  settings: CatalogLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: CatalogLlmLicenseCheckOptions = {},
): string | undefined {
  const res = verifyCatalogLlmLicense(settings, env, options);
  if (!res.valid) return undefined;
  return settings.licenseKey?.trim() || env[settings.licenseEnv]?.trim();
}

export function assertCatalogLlmLicense(
  settings: CatalogLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: CatalogLlmLicenseCheckOptions = {},
): void {
  const res = verifyCatalogLlmLicense(settings, env, options);
  if (!res.valid) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv, res));
  }
}
