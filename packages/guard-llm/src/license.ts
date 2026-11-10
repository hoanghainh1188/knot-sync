import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  GUARD_LLM_PLUGIN_NAME,
  GUARD_LLM_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { GuardLlmSettings } from "./settings.js";

export function isValidGuardLlmLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

export function licenseMissingMessage(licenseEnv: string): string {
  return (
    `Guard LLM license missing or invalid. ` +
    `Set ${licenseEnv} or ${GUARD_LLM_PLUGIN_NAME}.licenseKey ` +
    `(tests may use ${GUARD_LLM_TEST_LICENSE_SENTINEL}), then retry.`
  );
}

export function resolveGuardLlmLicense(
  settings: GuardLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  return isValidGuardLlmLicense(value) ? value : undefined;
}

export function assertGuardLlmLicense(
  settings: GuardLlmSettings,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!resolveGuardLlmLicense(settings, env)) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv));
  }
}
