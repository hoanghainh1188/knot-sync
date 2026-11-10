import { ConfigError } from "@hoanghainh/knot-sync-core";
import { DEFAULT_LICENSE_ENV, ENTERPRISE_SQL_PLUGIN_NAME } from "./constants.js";

export interface EnterpriseSqlSettings {
  licenseEnv: string;
  licenseKey?: string;
}

const ALLOWED_KEYS = new Set(["licenseEnv", "licenseKey"]);

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `"${ENTERPRISE_SQL_PLUGIN_NAME}.${key}" must be a non-empty string (got ${JSON.stringify(value)}). ` +
        `Fix ${ENTERPRISE_SQL_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value.trim();
}

export function parseEnterpriseSqlSettings(raw: unknown): EnterpriseSqlSettings {
  if (raw === undefined || raw === null) {
    return { licenseEnv: DEFAULT_LICENSE_ENV };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      `"${ENTERPRISE_SQL_PLUGIN_NAME}" settings must be a mapping of keys. ` +
        `Allowed: ${[...ALLOWED_KEYS].join(", ")}.`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "${ENTERPRISE_SQL_PLUGIN_NAME}". ` +
          `Allowed keys: ${[...ALLOWED_KEYS].join(", ")}.`,
      );
    }
  }

  const settings: EnterpriseSqlSettings = {
    licenseEnv:
      obj.licenseEnv === undefined
        ? DEFAULT_LICENSE_ENV
        : nonEmptyString(obj.licenseEnv, "licenseEnv"),
  };

  if (obj.licenseKey !== undefined) {
    settings.licenseKey = nonEmptyString(obj.licenseKey, "licenseKey");
  }

  return settings;
}
