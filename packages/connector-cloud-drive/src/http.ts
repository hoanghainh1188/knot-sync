import { posix as pathPosix } from "node:path";

export type FetchLike = typeof fetch;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 2_000;

function parseRetryAfterMs(headerValue: string | null): number {
  if (!headerValue) return 200;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_WAIT_MS, Math.max(50, Math.round(seconds * 1000)));
  }
  return 200;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Issue a fetch request with bounded Retry-After handling for 429/503 responses. */
export async function fetchWithRetry(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const mergedSignal =
    signal && init.signal
      ? AbortSignal.any([signal, init.signal])
      : signal ?? init.signal ?? undefined;

  let attempt = 0;
  while (true) {
    const res = await fetchFn(url, { ...init, signal: mergedSignal });
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_RETRIES) {
      return res;
    }
    attempt += 1;
    const waitMs = parseRetryAfterMs(res.headers.get("retry-after"));
    // Drain body before retrying so sockets can be reused cleanly.
    await res.body?.cancel().catch(() => undefined);
    await sleep(waitMs, mergedSignal);
  }
}

/** Read a Response body into a Buffer while enforcing maxBytes to prevent OOM. */
export async function readResponseBufferBounded(
  res: Response,
  maxBytes: number | undefined,
  relPath: string,
): Promise<Buffer> {
  const contentLength = res.headers.get("content-length");
  if (maxBytes && maxBytes > 0 && contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel().catch(() => undefined);
      throw Object.assign(
        new Error(
          `Skipped "${relPath}" (${declared} bytes) — over extraction.maxFileSizeMb limit.`,
        ),
        { code: "SKIPPED_TOO_LARGE" },
      );
    }
  }

  if (!res.body) {
    return Buffer.from(await res.arrayBuffer());
  }

  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (maxBytes && maxBytes > 0 && total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw Object.assign(
            new Error(
              `Skipped "${relPath}" (>${maxBytes} bytes) — over extraction.maxFileSizeMb limit.`,
            ),
            { code: "SKIPPED_TOO_LARGE" },
          );
        }
        chunks.push(Buffer.from(value));
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function normalizeCloudExt(name: string): string {
  const ext = pathPosix.extname(name).toLowerCase();
  return ext;
}

export function extToFileType(ext: string): string {
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

export function matchesAllowedExtensions(ext: string, allowed?: string[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  const normalized = allowed.map((e) => (e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));
  return normalized.includes(ext.toLowerCase());
}

export function readRequiredEnv(env: NodeJS.ProcessEnv, envName: string, label: string): string {
  const val = env[envName]?.trim();
  if (!val) {
    throw new Error(`Missing required environment variable "${envName}" for ${label}.`);
  }
  return val;
}

export interface TokenCache {
  get(key: string): string | undefined;
  set(key: string, token: string, expiresInSec?: number): void;
}

export function createInMemoryTokenCache(): TokenCache {
  const store = new Map<string, { token: string; expiresAt: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.token;
    },
    set(key, token, expiresInSec = 3600) {
      // Refresh 60s before expiry so long runs don't fail mid-request.
      const ttlMs = Math.max(10_000, (expiresInSec - 60) * 1000);
      store.set(key, { token, expiresAt: Date.now() + ttlMs });
    },
  };
}
