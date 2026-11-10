import type { SearchVectorSettings } from "./settings.js";

export type FetchLike = typeof fetch;

export class SearchVectorSoftFail extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchVectorSoftFail";
  }
}

function embeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/embeddings`;
  if (trimmed.endsWith("/embeddings")) return trimmed;
  return `${trimmed}/v1/embeddings`;
}

export interface EmbedTextOptions {
  settings: SearchVectorSettings;
  text: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

/** Call a local OpenAI-compatible embeddings endpoint. */
export async function embedText(options: EmbedTextOptions): Promise<number[]> {
  const { settings } = options;
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const truncated =
    options.text.length > settings.maxChars
      ? options.text.slice(0, settings.maxChars)
      : options.text;
  const url = embeddingsUrl(settings.baseUrl);
  const headers: Record<string, string> = { "content-type": "application/json" };
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
        input: truncated,
      }),
    });
    if (!res.ok) {
      throw new SearchVectorSoftFail(
        `Local embedding HTTP ${res.status} at ${url}. ` +
          `Check Ollama/Docker is running, model "${settings.model}", and ${settings.baseUrl}, then retry.`,
      );
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
      embedding?: number[];
    };
    const vector =
      json.data?.[0]?.embedding ??
      (Array.isArray(json.embedding) ? json.embedding : undefined);
    if (!vector || !Array.isArray(vector) || vector.length === 0) {
      throw new SearchVectorSoftFail(
        `Local embedding returned empty vector for model "${settings.model}". ` +
          `Check ${settings.baseUrl}, then retry.`,
      );
    }
    if (!vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
      throw new SearchVectorSoftFail(
        `Local embedding returned non-numeric vector. Check model "${settings.model}", then retry.`,
      );
    }
    return vector;
  } catch (err) {
    if (err instanceof SearchVectorSoftFail) throw err;
    const name = err instanceof Error ? err.name : undefined;
    if (name === "AbortError") {
      throw new SearchVectorSoftFail(
        `Local embedding timed out after ${settings.timeoutMs}ms. ` +
          `Raise search-vector.timeoutMs or check the model, then retry.`,
      );
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new SearchVectorSoftFail(
      `Local embedding request failed: ${detail}. ` +
        `Check ${settings.baseUrl} (Ollama/Docker), then retry.`,
    );
  } finally {
    clearTimeout(timer);
  }
}
