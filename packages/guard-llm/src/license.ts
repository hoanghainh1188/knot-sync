import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type LicenseVerificationResult,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  GUARD_LLM_PLUGIN_NAME,
  GUARD_LLM_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { GuardLlmSettings } from "./settings.js";

export type GuardLlmLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

export function isValidGuardLlmLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: GuardLlmLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: GUARD_LLM_PLUGIN_NAME,
    testSentinel: GUARD_LLM_TEST_LICENSE_SENTINEL,
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
    label: "Guard LLM",
    pluginId: GUARD_LLM_PLUGIN_NAME,
    licenseEnv,
    reason: failure?.reason,
    detail: failure?.detail,
  });
}

export function verifyGuardLlmLicense(
  settings: GuardLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: GuardLlmLicenseCheckOptions = {},
): LicenseVerificationResult {
  return resolveAndVerifyPluginLicense({
    pluginId: GUARD_LLM_PLUGIN_NAME,
    testSentinel: GUARD_LLM_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
}

export function resolveGuardLlmLicense(
  settings: GuardLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: GuardLlmLicenseCheckOptions = {},
): string | undefined {
  const res = verifyGuardLlmLicense(settings, env, options);
  if (!res.valid) return undefined;
  return settings.licenseKey?.trim() || env[settings.licenseEnv]?.trim();
}

export function assertGuardLlmLicense(
  settings: GuardLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: GuardLlmLicenseCheckOptions = {},
): void {
  const res = verifyGuardLlmLicense(settings, env, options);
  if (!res.valid) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv, res));
  }
}
