import {
  ConfigError,
  type AppConfig,
  type Document,
  type FileEntry,
  type PluginHost,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";
import { applyGuardToDocument } from "@hoanghainh/knot-sync-guard";
import { applyPiiToDocument } from "@hoanghainh/knot-sync-pii-basic";
import {
  DEFAULT_UPSERT_CHUNK,
  type SourceStats,
  type Store,
} from "@hoanghainh/knot-sync-store-sqlite";
import { maybeApplyHousenRewrite } from "./housen-rewrite.js";
import { extractWithOcrFallback } from "./ocr-fallback.js";
import { findExtractor } from "./plugins.js";

export interface ScanSourcePassResult {
  sourceId: string;
  files: FileEntry[];
  stats: SourceStats;
  issues: ScanIssue[];
  topDuplicates: { size: number; paths: string[] }[];
}

export interface ScanPassOptions {
  config: AppConfig;
  host: PluginHost;
  store: Store;
  signal?: AbortSignal;
  /** Yield to the event loop periodically so concurrent server requests stay responsive. */
  yieldBetweenItems?: boolean;
  onSourceProgress?: (sourceId: string, count: number) => void;
  onSourceDone?: (sourceId: string) => void;
}

export interface ScanPassResult {
  sources: ScanSourcePassResult[];
  scanned: number;
  aborted: boolean;
}

export interface SyncRunIssue {
  path: string;
  code: string;
  message: string;
}

export interface SyncEmbedResult {
  written: number;
  skipped: number;
  failed: number;
  skippedBySetting?: boolean;
  error?: string;
}

export interface SyncPassOptions {
  config: AppConfig;
  host: PluginHost;
  store: Store;
  signal?: AbortSignal;
  /** Yield to the event loop between files so concurrent server requests stay responsive. */
  yieldBetweenItems?: boolean;
}

export interface SyncPassResult {
  noInventory: boolean;
  extracted: number;
  skipped: number;
  pruned: number;
  failed: number;
  issues: SyncRunIssue[];
  aborted: boolean;
  embed?: SyncEmbedResult;
}

export interface PeriodicSyncSummary {
  scanned: number;
  extracted: number;
  skipped: number;
  pruned: number;
  failed: number;
  durationMs: number;
  aborted: boolean;
  embedError?: string;
}

export interface PeriodicSyncOptions {
  intervalSeconds: number;
  runCycle: (signal: AbortSignal) => Promise<PeriodicSyncSummary>;
  onCycleStart?: () => void | Promise<void>;
  onCycleEnd?: (summary: PeriodicSyncSummary) => void | Promise<void>;
  onCycleError?: (error: unknown, durationMs: number) => void | Promise<void>;
}

export interface PeriodicSyncHandle {
  /** Stop scheduling future cycles, signal abort to any active cycle, and wait until it drains. */
  stop: () => Promise<void>;
  readonly running: boolean;
}

const SCAN_YIELD_EVERY = 50;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Build an error-status document stripped of raw/original sensitive text before persistence. */
function makeSanitizedErrorDocument(
  sourceDoc: Document,
  message: string,
  options?: {
    preservePii?: boolean;
    preserveGuard?: boolean;
    keepOriginalContent?: string | number | boolean;
  },
): Document {
  const {
    sourceFileHash: _drop,
    originalContent: _oc,
    originalTables: _ot,
    guardHiddenText: _ht,
    ...restMeta
  } = sourceDoc.metadata;
  void _drop;
  void _oc;
  void _ot;
  void _ht;
  return {
    ...sourceDoc,
    content: "",
    tables: [],
    pii: options?.preservePii ? sourceDoc.pii : [],
    guard: options?.preserveGuard ? (sourceDoc.guard ?? []) : [],
    metadata: {
      ...restMeta,
      status: "error",
      errorMessage: message,
      ...(options?.keepOriginalContent !== undefined
        ? { originalContent: options.keepOriginalContent }
        : {}),
    },
  };
}

/** Scan all configured sources into the caller's open SQLite inventory. */
export async function runScanPass(options: ScanPassOptions): Promise<ScanPassResult> {
  const { config, host, store, signal, yieldBetweenItems = false } = options;
  const results: ScanSourcePassResult[] = [];
  let scanned = 0;

  for (const source of config.sources) {
    if (signal?.aborted) {
      return { sources: results, scanned, aborted: true };
    }
    const connector = host.getConnector(source.type);
    if (!connector) {
      throw new ConfigError(
        `No connector registered for source type "${source.type}". ` +
          `Registered: ${host.listConnectorIds().join(", ") || "(none)"}.`,
      );
    }

    const files: FileEntry[] = [];
    const issues: ScanIssue[] = [];

    for await (const entry of connector.scan(source, {
      hash: config.scan.hash,
      onIssue: (i) => issues.push(i),
    })) {
      if (signal?.aborted) {
        options.onSourceDone?.(source.id);
        return { sources: results, scanned, aborted: true };
      }
      files.push(entry);
      options.onSourceProgress?.(source.id, files.length);
      if (yieldBetweenItems && files.length % SCAN_YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }
    }
    options.onSourceDone?.(source.id);

    if (signal?.aborted) {
      return { sources: results, scanned, aborted: true };
    }

    store.replaceScan(source.id, files, issues);
    scanned += files.length;
    results.push({
      sourceId: source.id,
      files,
      stats: store.stats(source.id, config.scan.oldFileYears),
      issues,
      topDuplicates: store.duplicateGroups(source.id, 5),
    });
  }

  return { sources: results, scanned, aborted: false };
}

/** Extract, clean, mask PII, guard, upsert, prune stale documents, and optionally embed. */
export async function runSyncPass(options: SyncPassOptions): Promise<SyncPassResult> {
  const { config, host, store, signal: shutdownSignal, yieldBetweenItems = false } = options;
  const files = store.listFiles();
  if (files.length === 0 && !store.hasAnyScan()) {
    return {
      noInventory: true,
      extracted: 0,
      skipped: 0,
      pruned: 0,
      failed: 0,
      issues: [],
      aborted: false,
    };
  }

  let extracted = 0;
  let skipped = 0;
  let failed = 0;
  let aborted = false;
  const issues: SyncRunIssue[] = [];
  const pending: Document[] = [];

  const flushPending = () => {
    if (pending.length === 0) return;
    store.upsertDocuments(pending);
    pending.length = 0;
  };
  const enqueue = (document: Document) => {
    pending.push(document);
    if (pending.length >= DEFAULT_UPSERT_CHUNK) flushPending();
  };

  for (const file of files) {
    if (shutdownSignal?.aborted) {
      aborted = true;
      break;
    }
    if (yieldBetweenItems) {
      await yieldToEventLoop();
      if (shutdownSignal?.aborted) {
        aborted = true;
        break;
      }
    }

    const extractor = findExtractor(host, file);
    if (!extractor) {
      failed += 1;
      issues.push({
        path: file.relPath,
        code: "UNSUPPORTED",
        message: `No extractor registered for ${file.ext || "(no extension)"}.`,
      });
      continue;
    }

    if (store.isUnchangedExtraction(file)) {
      skipped += 1;
      continue;
    }

    const maxFileSizeBytes = config.extraction.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxFileSizeBytes) {
      failed += 1;
      issues.push({
        path: file.relPath,
        code: "SKIPPED_TOO_LARGE",
        message:
          `Skipped "${file.relPath}" (${file.size} bytes) — over extraction.maxFileSizeMb=${config.extraction.maxFileSizeMb}. ` +
          `Raise the limit or exclude the file, then retry "knot-sync run".`,
      });
      continue;
    }

    const timeoutMs = Math.max(1, Math.floor(config.extraction.timeoutSeconds * 1000));
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = shutdownSignal
      ? AbortSignal.any([shutdownSignal, timeoutSignal])
      : timeoutSignal;
    const timeoutMessage =
      `Extraction timed out for "${file.relPath}" after ${config.extraction.timeoutSeconds}s. ` +
      `Raise extraction.timeoutSeconds or exclude the file, then retry "knot-sync run".`;

    try {
      const extractCtx = {
        signal: combinedSignal,
        maxFileSizeBytes,
        maxTextChars: config.extraction.maxTextChars,
      };
      const raced = await Promise.race([
        (async () => {
          const primary = await extractWithOcrFallback(
            host,
            file,
            extractor,
            extractCtx,
          );
          return maybeApplyHousenRewrite(host, file, primary, extractCtx);
        })(),
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            combinedSignal.removeEventListener("abort", onAbort);
            const name = shutdownSignal?.aborted ? "AbortError" : "TimeoutError";
            const msg = shutdownSignal?.aborted ? "Sync aborted" : timeoutMessage;
            reject(Object.assign(new Error(msg), { name }));
          };
          if (combinedSignal.aborted) onAbort();
          else combinedSignal.addEventListener("abort", onAbort, { once: true });
        }),
      ]);

      if (shutdownSignal?.aborted) {
        aborted = true;
        break;
      }
      if (timeoutSignal.aborted) {
        failed += 1;
        issues.push({
          path: file.relPath,
          code: "EXTRACT_TIMEOUT",
          message: timeoutMessage,
        });
        continue;
      }

      const { result, sideIssues } = raced;
      // Side issues (e.g. housen LICENSE) keep the office Document — record
      // without double-counting the file as both extracted and failed.
      for (const si of sideIssues) {
        issues.push({ path: file.relPath, code: si.code, message: si.message });
      }
      if (!result.ok) {
        failed += 1;
        issues.push({ path: file.relPath, code: result.code, message: result.message });
        continue;
      }

      let document = result.document;
      let currentCleanerId = "(unknown)";
      try {
        for (const cleaner of host.cleaners.values()) {
          currentCleanerId = cleaner.id;
          document = await cleaner.clean(document);
        }
      } catch (err) {
        const message =
          `Cleaner "${currentCleanerId}" failed (${(err as Error).message || String(err)}). ` +
          `Disable steps under cleaning: or fix the input, then retry "knot-sync run".`;
        // Never persist unmasked PII on error — omit originals when rules are active.
        enqueue(
          makeSanitizedErrorDocument(result.document, message, {
            keepOriginalContent:
              host.piiRules.size === 0 && config.cleaning.keepOriginalText === true
                ? (result.document.metadata.originalContent ?? result.document.content)
                : undefined,
          }),
        );
        failed += 1;
        issues.push({ path: file.relPath, code: "CLEAN", message });
        continue;
      }

      try {
        if (host.piiRules.size > 0) {
          document = applyPiiToDocument(document, host.piiRules.values(), config.pii);
        }
      } catch (err) {
        const message =
          `PII masking failed (${(err as Error).message || String(err)}). ` +
          `Check pii: settings or disable rules, then retry "knot-sync run".`;
        enqueue(makeSanitizedErrorDocument(document, message));
        failed += 1;
        issues.push({ path: file.relPath, code: "PII", message });
        continue;
      }

      try {
        if (host.guardRules.size > 0) {
          document = applyGuardToDocument(
            document,
            host.guardRules.values(),
            config.guard,
          );
          if (document.metadata.status === "error") {
            enqueue(document);
            failed += 1;
            issues.push({
              path: file.relPath,
              code: "GUARD",
              message: String(document.metadata.errorMessage ?? "blocked by guard"),
            });
            continue;
          }
        }
      } catch (err) {
        const message =
          `Prompt-injection guard failed (${(err as Error).message || String(err)}). ` +
          `Check guard: settings or disable rules, then retry "knot-sync run".`;
        enqueue(
          makeSanitizedErrorDocument(document, message, {
            preservePii: true,
            preserveGuard: true,
          }),
        );
        failed += 1;
        issues.push({ path: file.relPath, code: "GUARD", message });
        continue;
      }

      try {
        let blockedByEnricher = false;
        for (const enricher of host.documentEnrichers.values()) {
          document = await enricher.enrich(document, {
            pii: config.pii,
            guard: config.guard,
          });
          if (document.metadata.status === "error") {
            enqueue(document);
            failed += 1;
            issues.push({
              path: file.relPath,
              code: "GUARD",
              message: String(
                document.metadata.errorMessage ?? "blocked by document enricher",
              ),
            });
            blockedByEnricher = true;
            break;
          }
        }
        if (blockedByEnricher) continue;
        enqueue(document);
        extracted += 1;
      } catch (err) {
        const message =
          `Document enricher failed (${(err as Error).message || String(err)}). ` +
          `Check paid enricher plugins (e.g. guard-llm) settings, then retry "knot-sync run".`;
        enqueue(
          makeSanitizedErrorDocument(document, message, {
            preservePii: true,
            preserveGuard: true,
          }),
        );
        failed += 1;
        issues.push({ path: file.relPath, code: "ENRICH", message });
      }
    } catch (err) {
      if (shutdownSignal?.aborted) {
        aborted = true;
        break;
      }
      failed += 1;
      const name = (err as { name?: string }).name ?? "";
      const timedOut =
        timeoutSignal.aborted || name === "TimeoutError" || name === "AbortError";
      issues.push({
        path: file.relPath,
        code: timedOut ? "EXTRACT_TIMEOUT" : "EXTRACT",
        message: timedOut ? timeoutMessage : (err as Error).message || String(err),
      });
    }
  }

  flushPending();

  const { pruned } = aborted
    ? { pruned: 0 }
    : store.pruneStaleDocuments(config.sources.map((s) => s.id));

  let embed: SyncEmbedResult | undefined;
  const embedTool = host.mcpTools.get("embed_documents");
  if (embedTool && !aborted) {
    try {
      const embedResult = await embedTool.handler({ onRun: true }, { store, config });
      embed = {
        written: Number(embedResult.meta?.written ?? 0),
        skipped: Number(embedResult.meta?.skipped ?? 0),
        failed: Number(embedResult.meta?.failed ?? 0),
        skippedBySetting: Boolean(embedResult.meta?.skippedBySetting),
      };
    } catch (err) {
      embed = {
        written: 0,
        skipped: 0,
        failed: 0,
        error: (err as Error).message || String(err),
      };
    }
  }

  return {
    noInventory: false,
    extracted,
    skipped,
    pruned,
    failed,
    issues,
    aborted,
    ...(embed !== undefined ? { embed } : {}),
  };
}

/** Run an in-process scan + extraction/upsert/prune cycle using an existing open store. */
export async function runInProcessSyncCycle(options: {
  config: AppConfig;
  host: PluginHost;
  store: Store;
  signal: AbortSignal;
}): Promise<PeriodicSyncSummary> {
  const startedAt = Date.now();
  const scanRes = await runScanPass({
    config: options.config,
    host: options.host,
    store: options.store,
    signal: options.signal,
    yieldBetweenItems: true,
  });
  if (scanRes.aborted || options.signal.aborted) {
    return {
      scanned: scanRes.scanned,
      extracted: 0,
      skipped: 0,
      pruned: 0,
      failed: 0,
      durationMs: Date.now() - startedAt,
      aborted: true,
    };
  }
  const syncRes = await runSyncPass({
    config: options.config,
    host: options.host,
    store: options.store,
    signal: options.signal,
    yieldBetweenItems: true,
  });
  return {
    scanned: scanRes.scanned,
    extracted: syncRes.extracted,
    skipped: syncRes.skipped,
    pruned: syncRes.pruned,
    failed: syncRes.failed,
    durationMs: Date.now() - startedAt,
    aborted: syncRes.aborted,
    ...(syncRes.embed?.error !== undefined ? { embedError: syncRes.embed.error } : {}),
  };
}

/**
 * Schedule sequential non-overlapping sync cycles with `setTimeout` (wait one interval
 * after each cycle settles before scheduling the next) and drain on `stop()`.
 */
export function startPeriodicSync(options: PeriodicSyncOptions): PeriodicSyncHandle {
  const delayMs = Math.max(1, Math.round(options.intervalSeconds * 1000));
  const abortController = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;

  const scheduleNext = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (stopped) return;
      inFlight = runOneCycle();
    }, delayMs);
    timer.unref?.();
  };

  const safeCallback = async (fn?: () => void | Promise<void>) => {
    if (!fn) return;
    try {
      await fn();
    } catch {
      // Never allow telemetry/log callbacks to terminate the background scheduler.
    }
  };

  const runOneCycle = async () => {
    const startedAt = Date.now();
    await safeCallback(options.onCycleStart);
    try {
      const summary = await options.runCycle(abortController.signal);
      await safeCallback(() => options.onCycleEnd?.(summary));
    } catch (err) {
      await safeCallback(() => options.onCycleError?.(err, Date.now() - startedAt));
    } finally {
      inFlight = undefined;
      scheduleNext();
    }
  };

  scheduleNext();

  return {
    get running() {
      return inFlight !== undefined;
    },
    async stop() {
      stopped = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      abortController.abort();
      if (inFlight) {
        await inFlight;
      }
    },
  };
}
