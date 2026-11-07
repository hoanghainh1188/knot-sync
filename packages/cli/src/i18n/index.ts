import type { CliLocale } from "@hoanghainh/knot-sync-core";
import { en } from "./en.js";
import { ja } from "./ja.js";
import type { MessageCatalog, MessageKey } from "./messages.js";
import { vi } from "./vi.js";

export type { MessageCatalog, MessageKey } from "./messages.js";
export type { CliLocale };

export const CLI_LOCALES: readonly CliLocale[] = ["en", "ja", "vi"];

const catalogs: Record<CliLocale, MessageCatalog> = { en, ja, vi };

export function isCliLocale(value: string): value is CliLocale {
  return value === "en" || value === "ja" || value === "vi";
}

/** Validate `--lang` value; throws with a localized actionable message (en fallback). */
export function parseLangFlag(
  value: string | undefined,
  errorLocale: CliLocale = "en",
): CliLocale | undefined {
  if (value === undefined) return undefined;
  if (isCliLocale(value)) return value;
  throw new Error(t(errorLocale, "error.invalidLang", { value }));
}

function fromEnv(env: NodeJS.ProcessEnv): CliLocale | undefined {
  const explicit = env.KNOT_SYNC_LANG?.trim();
  if (explicit && isCliLocale(explicit)) return explicit;
  const tag = (env.LC_ALL || env.LANG || "").trim().toLowerCase();
  if (tag.startsWith("ja")) return "ja";
  if (tag.startsWith("vi")) return "vi";
  return undefined;
}

/**
 * Resolve effective locale: flag → config → env heuristic → en.
 */
export function resolveLocale(opts: {
  flag?: string;
  configLocale?: CliLocale;
  env?: NodeJS.ProcessEnv;
}): CliLocale {
  const flag = parseLangFlag(opts.flag);
  if (flag) return flag;
  if (opts.configLocale && isCliLocale(opts.configLocale)) return opts.configLocale;
  return fromEnv(opts.env ?? process.env) ?? "en";
}

export function t(
  locale: CliLocale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/** Every locale catalog for parity tests. */
export function allCatalogs(): Record<CliLocale, MessageCatalog> {
  return catalogs;
}
