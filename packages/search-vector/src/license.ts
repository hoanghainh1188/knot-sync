import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type LicenseVerificationResult,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  SEARCH_VECTOR_PLUGIN_NAME,
  SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { SearchVectorSettings } from "./settings.js";

export type SearchVectorLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

export function isValidSearchVectorLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: SearchVectorLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: SEARCH_VECTOR_PLUGIN_NAME,
    testSentinel: SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
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
    label: "Search-vector",
    pluginId: SEARCH_VECTOR_PLUGIN_NAME,
    licenseEnv,
    reason: failure?.reason,
    detail: failure?.detail,
  });
}

export function verifySearchVectorLicense(
  settings: SearchVectorSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: SearchVectorLicenseCheckOptions = {},
): LicenseVerificationResult {
  return resolveAndVerifyPluginLicense({
    pluginId: SEARCH_VECTOR_PLUGIN_NAME,
    testSentinel: SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
}

export function resolveSearchVectorLicense(
  settings: SearchVectorSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: SearchVectorLicenseCheckOptions = {},
): string | undefined {
  const res = verifySearchVectorLicense(settings, env, options);
  if (!res.valid) return undefined;
  return settings.licenseKey?.trim() || env[settings.licenseEnv]?.trim();
}

export function assertSearchVectorLicense(
  settings: SearchVectorSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: SearchVectorLicenseCheckOptions = {},
): void {
  const res = verifySearchVectorLicense(settings, env, options);
  if (!res.valid) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv, res));
  }
}
