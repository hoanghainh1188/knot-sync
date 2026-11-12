import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type LicenseVerificationResult,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  ENTERPRISE_SQL_PLUGIN_NAME,
  SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { EnterpriseSqlSettings } from "./settings.js";

export type EnterpriseSqlLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

export function isValidEnterpriseSqlLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: EnterpriseSqlLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: ENTERPRISE_SQL_PLUGIN_NAME,
    testSentinel: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
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
    label: "Enterprise SQL",
    pluginId: ENTERPRISE_SQL_PLUGIN_NAME,
    licenseEnv,
    reason: failure?.reason,
    detail: failure?.detail,
  });
}

export function verifyEnterpriseSqlLicense(
  settings: EnterpriseSqlSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: EnterpriseSqlLicenseCheckOptions = {},
): LicenseVerificationResult {
  return resolveAndVerifyPluginLicense({
    pluginId: ENTERPRISE_SQL_PLUGIN_NAME,
    testSentinel: SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
}

export function resolveEnterpriseSqlLicense(
  settings: EnterpriseSqlSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: EnterpriseSqlLicenseCheckOptions = {},
): string | undefined {
  const res = verifyEnterpriseSqlLicense(settings, env, options);
  if (!res.valid) return undefined;
  return settings.licenseKey?.trim() || env[settings.licenseEnv]?.trim();
}

/** Throw ConfigError when license is missing or invalid — blocks parse/connect. */
export function assertEnterpriseSqlLicense(
  settings: EnterpriseSqlSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: EnterpriseSqlLicenseCheckOptions = {},
): void {
  const res = verifyEnterpriseSqlLicense(settings, env, options);
  if (!res.valid) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv, res));
  }
}
