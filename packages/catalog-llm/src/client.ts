import type { CatalogSuggestInput, CatalogSuggestion } from "@hoanghainh/knot-sync-core";
import type { CatalogLlmSettings } from "./settings.js";

export type FetchLike = typeof fetch;

export class CatalogLlmSoftFail extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogLlmSoftFail";
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/v1/chat/completions`;
}

function buildPrompt(input: CatalogSuggestInput, includeSamples: boolean): string {
  const parts = [
    `Suggest business labels for a SQL column used by Japanese and Vietnamese enterprises.`,
    `Return ONLY a JSON object with optional keys: ja, vi, en, description, pii (boolean).`,
    `Do not include markdown fences or commentary.`,
    `table: ${input.table}`,
    `column: ${input.column}`,
  ];
  if (input.dbType) parts.push(`dbType: ${input.dbType}`);
  if (includeSamples && input.sampleValues && input.sampleValues.length > 0) {
    parts.push(`samples: ${JSON.stringify(input.sampleValues.slice(0, 8))}`);
  }
  return parts.join("\n");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const body = fence?.[1] ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toSuggestion(obj: Record<string, unknown>): CatalogSuggestion {
  const label: { ja?: string; vi?: string; en?: string } = {};
  if (typeof obj.ja === "string" && obj.ja.trim()) label.ja = obj.ja.trim();
  if (typeof obj.vi === "string" && obj.vi.trim()) label.vi = obj.vi.trim();
  if (typeof obj.en === "string" && obj.en.trim()) label.en = obj.en.trim();
  const out: CatalogSuggestion = {};
  if (label.ja || label.vi || label.en) out.label = label;
  if (typeof obj.description === "string" && obj.description.trim()) {
    out.description = obj.description.trim();
  }
  if (typeof obj.pii === "boolean") out.pii = obj.pii;
  return out;
}

export interface SuggestViaChatOptions {
  settings: CatalogLlmSettings;
  input: CatalogSuggestInput;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

/**
 * Call a local OpenAI-compatible chat completions endpoint.
 * Throws CatalogLlmSoftFail on transport/parse errors (caller soft-fails).
 */
export async function suggestViaChat(
  options: SuggestViaChatOptions,
): Promise<CatalogSuggestion> {
  const { settings, input } = options;
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = chatCompletionsUrl(settings.baseUrl);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const apiKey = env[settings.apiKeyEnv]?.trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You label cryptic SQL columns for enterprise catalogs. Reply with JSON only.",
          },
          { role: "user", content: buildPrompt(input, settings.includeSamples) },
        ],
      }),
    });
    if (!res.ok) {
      throw new CatalogLlmSoftFail(
        `Local LLM HTTP ${res.status} at ${url}. ` +
          `Check Ollama/Docker is running, model "${settings.model}", and ${settings.baseUrl}, then retry.`,
      );
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new CatalogLlmSoftFail(
        `Local LLM returned empty content for column "${input.column}". ` +
          `Check model "${settings.model}" at ${settings.baseUrl}, then retry.`,
      );
    }
    const obj = extractJsonObject(content);
    if (!obj) {
      throw new CatalogLlmSoftFail(
        `Local LLM returned non-JSON for column "${input.column}". ` +
          `Try another model or lower temperature, then retry.`,
      );
    }
    return toSuggestion(obj);
  } catch (err) {
    if (err instanceof CatalogLlmSoftFail) throw err;
    const name = err instanceof Error ? err.name : undefined;
    if (name === "AbortError") {
      throw new CatalogLlmSoftFail(
        `Local LLM timed out after ${settings.timeoutMs}ms for column "${input.column}". ` +
          `Raise catalog-llm.timeoutMs or check the model, then retry.`,
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new CatalogLlmSoftFail(
      `Local LLM request failed for column "${input.column}": ${detail}. ` +
        `Check ${settings.baseUrl} (Ollama/Docker), then retry.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
