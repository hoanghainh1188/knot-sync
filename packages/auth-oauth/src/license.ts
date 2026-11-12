import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  verifyLicenseToken,
  type LicenseVerificationFailure,
  type LicenseVerificationResult,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  AUTH_OAUTH_PLUGIN_NAME,
  OAUTH_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { AuthOauthSettings } from "./settings.js";

export type OauthLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

export function isValidOauthLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: OauthLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: AUTH_OAUTH_PLUGIN_NAME,
    testSentinel: OAUTH_TEST_LICENSE_SENTINEL,
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
    label: "OAuth",
    pluginId: AUTH_OAUTH_PLUGIN_NAME,
    licenseEnv,
    reason: failure?.reason,
    detail: failure?.detail,
  });
}

export function verifyOauthLicense(
  settings: AuthOauthSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: OauthLicenseCheckOptions = {},
): LicenseVerificationResult {
  return resolveAndVerifyPluginLicense({
    pluginId: AUTH_OAUTH_PLUGIN_NAME,
    testSentinel: OAUTH_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
}

export function resolveOauthLicense(
  settings: AuthOauthSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: OauthLicenseCheckOptions = {},
): string | undefined {
  const res = verifyOauthLicense(settings, env, options);
  if (!res.valid) return undefined;
  return settings.licenseKey?.trim() || env[settings.licenseEnv]?.trim();
}

export function assertOauthLicense(
  settings: AuthOauthSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: OauthLicenseCheckOptions = {},
): void {
  const res = verifyOauthLicense(settings, env, options);
  if (!res.valid) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv, res));
  }
}

export { verifyLicenseToken };
