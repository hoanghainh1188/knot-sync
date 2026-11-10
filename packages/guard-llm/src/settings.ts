import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_LICENSE_ENV,
  DEFAULT_MAX_CHARS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  GUARD_LLM_PLUGIN_NAME,
} from "./constants.js";

export interface GuardLlmSettings {
  licenseEnv: string;
  licenseKey?: string;
  /** OpenAI-compatible API base (Ollama or Docker). */
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxChars: number;
  /** Env name for optional local Bearer token. */
  apiKeyEnv: string;
}

const ALLOWED_KEYS = new Set([
  "licenseEnv",
  "licenseKey",
  "baseUrl",
  "model",
  "timeoutMs",
  "maxChars",
  "apiKeyEnv",
]);

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `"${GUARD_LLM_PLUGIN_NAME}.${key}" must be a non-empty string (got ${JSON.stringify(value)}). ` +
        `Fix ${GUARD_LLM_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value.trim();
}

function positiveInt(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError(
      `"${GUARD_LLM_PLUGIN_NAME}.${key}" must be a positive integer (got ${JSON.stringify(value)}). ` +
        `Fix ${GUARD_LLM_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value;
}

export function parseGuardLlmSettings(raw: unknown): GuardLlmSettings {
  if (raw === undefined || raw === null) {
    return {
      licenseEnv: DEFAULT_LICENSE_ENV,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxChars: DEFAULT_MAX_CHARS,
      apiKeyEnv: DEFAULT_API_KEY_ENV,
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      `"${GUARD_LLM_PLUGIN_NAME}" settings must be a mapping of keys. ` +
        `Allowed: ${[...ALLOWED_KEYS].join(", ")}.`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "${GUARD_LLM_PLUGIN_NAME}". ` +
          `Allowed keys: ${[...ALLOWED_KEYS].join(", ")}.`,
      );
    }
  }

  const settings: GuardLlmSettings = {
    licenseEnv:
      obj.licenseEnv === undefined
        ? DEFAULT_LICENSE_ENV
        : nonEmptyString(obj.licenseEnv, "licenseEnv"),
    baseUrl: obj.baseUrl === undefined ? DEFAULT_BASE_URL : nonEmptyString(obj.baseUrl, "baseUrl"),
    model: obj.model === undefined ? DEFAULT_MODEL : nonEmptyString(obj.model, "model"),
    timeoutMs:
      obj.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : positiveInt(obj.timeoutMs, "timeoutMs"),
    maxChars:
      obj.maxChars === undefined ? DEFAULT_MAX_CHARS : positiveInt(obj.maxChars, "maxChars"),
    apiKeyEnv:
      obj.apiKeyEnv === undefined
        ? DEFAULT_API_KEY_ENV
        : nonEmptyString(obj.apiKeyEnv, "apiKeyEnv"),
  };

  if (obj.licenseKey !== undefined) {
    settings.licenseKey = nonEmptyString(obj.licenseKey, "licenseKey");
  }

  try {
    new URL(settings.baseUrl);
  } catch {
    throw new ConfigError(
      `"${GUARD_LLM_PLUGIN_NAME}.baseUrl" must be a valid URL (got ${JSON.stringify(settings.baseUrl)}). ` +
        `Use a local OpenAI-compatible base such as ${DEFAULT_BASE_URL}, then retry.`,
    );
  }

  return settings;
}
