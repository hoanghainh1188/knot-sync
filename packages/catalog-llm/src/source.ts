import type {
  CatalogSource,
  CatalogSuggestInput,
  CatalogSuggestion,
} from "@hoanghainh/knot-sync-core";
import { CatalogLlmSoftFail, suggestViaChat, type FetchLike } from "./client.js";
import { CATALOG_LLM_SOURCE_ID } from "./constants.js";
import { resolveCatalogLlmLicense } from "./license.js";
import type { CatalogLlmSettings } from "./settings.js";

export interface CreateCatalogLlmSourceOptions {
  settings: CatalogLlmSettings;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  /** Collect soft-fail messages for tests / describe diagnostics. */
  onSoftFail?: (message: string) => void;
}

export function createCatalogLlmSource(
  options: CreateCatalogLlmSourceOptions,
): CatalogSource {
  const { settings } = options;
  const env = options.env ?? process.env;

  return {
    id: CATALOG_LLM_SOURCE_ID,
    async suggest(input: CatalogSuggestInput): Promise<CatalogSuggestion> {
      if (!resolveCatalogLlmLicense(settings, env)) {
        options.onSoftFail?.(
          `Catalog LLM skipped for "${input.column}": license missing. ` +
            `Set ${settings.licenseEnv} or catalog-llm.licenseKey, then retry.`,
        );
        return {};
      }
      try {
        return await suggestViaChat({
          settings,
          input,
          env,
          fetchImpl: options.fetchImpl,
        });
      } catch (err) {
        const message =
          err instanceof CatalogLlmSoftFail
            ? err.message
            : `Catalog LLM soft-fail for "${input.column}": ${
                err instanceof Error ? err.message : String(err)
              }`;
        options.onSoftFail?.(message);
        return {};
      }
    },
  };
}
