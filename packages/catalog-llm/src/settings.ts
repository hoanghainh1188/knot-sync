import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  CATALOG_LLM_PLUGIN_NAME,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_LICENSE_ENV,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
} from "./constants.js";

export interface CatalogLlmSettings {
  licenseEnv: string;
  licenseKey?: string;
  /** OpenAI-compatible API base (Ollama or Docker). */
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** When true, include sampleValues in the prompt (PII risk; default false). */
  includeSamples: boolean;
  /** Env name for optional local Bearer token. */
  apiKeyEnv: string;
}

const ALLOWED_KEYS = new Set([
  "licenseEnv",
  "licenseKey",
  "baseUrl",
  "model",
  "timeoutMs",
  "includeSamples",
  "apiKeyEnv",
]);

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `"${CATALOG_LLM_PLUGIN_NAME}.${key}" must be a non-empty string (got ${JSON.stringify(value)}). ` +
        `Fix ${CATALOG_LLM_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value.trim();
}

function positiveInt(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError(
      `"${CATALOG_LLM_PLUGIN_NAME}.${key}" must be a positive integer (got ${JSON.stringify(value)}). ` +
        `Fix ${CATALOG_LLM_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value;
}

function bool(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw new ConfigError(
      `"${CATALOG_LLM_PLUGIN_NAME}.${key}" must be a boolean (got ${JSON.stringify(value)}). ` +
        `Fix ${CATALOG_LLM_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value;
}

export function parseCatalogLlmSettings(raw: unknown): CatalogLlmSettings {
  if (raw === undefined || raw === null) {
    return {
      licenseEnv: DEFAULT_LICENSE_ENV,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      includeSamples: false,
      apiKeyEnv: DEFAULT_API_KEY_ENV,
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      `"${CATALOG_LLM_PLUGIN_NAME}" settings must be a mapping of keys. ` +
        `Allowed: ${[...ALLOWED_KEYS].join(", ")}.`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "${CATALOG_LLM_PLUGIN_NAME}". ` +
          `Allowed keys: ${[...ALLOWED_KEYS].join(", ")}.`,
      );
    }
  }

  const settings: CatalogLlmSettings = {
    licenseEnv:
      obj.licenseEnv === undefined
        ? DEFAULT_LICENSE_ENV
        : nonEmptyString(obj.licenseEnv, "licenseEnv"),
    baseUrl: obj.baseUrl === undefined ? DEFAULT_BASE_URL : nonEmptyString(obj.baseUrl, "baseUrl"),
    model: obj.model === undefined ? DEFAULT_MODEL : nonEmptyString(obj.model, "model"),
    timeoutMs:
      obj.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : positiveInt(obj.timeoutMs, "timeoutMs"),
    includeSamples:
      obj.includeSamples === undefined ? false : bool(obj.includeSamples, "includeSamples"),
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
      `"${CATALOG_LLM_PLUGIN_NAME}.baseUrl" must be a valid URL (got ${JSON.stringify(settings.baseUrl)}). ` +
        `Use a local OpenAI-compatible base such as ${DEFAULT_BASE_URL}, then retry.`,
    );
  }

  return settings;
}
