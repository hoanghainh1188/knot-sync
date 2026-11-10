import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  ENTERPRISE_SQL_PLUGIN_NAME,
  SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { EnterpriseSqlSettings } from "./settings.js";

export function isValidEnterpriseSqlLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

export function licenseMissingMessage(licenseEnv: string): string {
  return (
    `Enterprise SQL license missing or invalid. ` +
    `Set ${licenseEnv} or ${ENTERPRISE_SQL_PLUGIN_NAME}.licenseKey ` +
    `(tests may use ${SQL_ENTERPRISE_TEST_LICENSE_SENTINEL}), then retry.`
  );
}

export function resolveEnterpriseSqlLicense(
  settings: EnterpriseSqlSettings,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  return isValidEnterpriseSqlLicense(value) ? value : undefined;
}

/** Throw ConfigError when license is missing — blocks parse/connect. */
export function assertEnterpriseSqlLicense(
  settings: EnterpriseSqlSettings,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!resolveEnterpriseSqlLicense(settings, env)) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv));
  }
}
