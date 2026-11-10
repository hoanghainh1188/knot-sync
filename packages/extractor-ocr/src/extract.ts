import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  documentId,
  sha256,
  type Document,
  type ExtractContext,
  type ExtractResult,
  type FileEntry,
} from "@hoanghainh/knot-sync-core";
import { OCR_EXTRACTOR_ID } from "./constants.js";
import { checkOcrLicense } from "./license.js";
import type { DockerRunner } from "./docker.js";
import { defaultDockerRunner } from "./docker.js";
import type { OcrSettings } from "./settings.js";

function fail(code: string, message: string): ExtractResult {
  return { ok: false, code, message };
}

function titleFromPath(relPath: string): string {
  return basename(relPath) || relPath;
}

function toDocument(file: FileEntry, content: string): Document {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd() + (content ? "\n" : "");
  return {
    id: documentId(file.sourceId, file.relPath),
    sourceId: file.sourceId,
    type: file.type,
    title: titleFromPath(file.relPath),
    content: normalized,
    tables: [],
    metadata: {
      relPath: file.relPath,
      sourceFileHash: file.hash,
      extractor: OCR_EXTRACTOR_ID,
      ocr: true,
    },
    pii: [],
    guard: [],
    hash: sha256(normalized),
  };
}

export interface ExtractOcrOptions {
  settings: OcrSettings;
  dockerRunner?: DockerRunner;
  env?: NodeJS.ProcessEnv;
}

/**
 * OCR a single inventory file via local Docker Docling.
 * Never writes to the source path; mounts it read-only.
 */
export async function extractOcrFile(
  file: FileEntry,
  ctx: ExtractContext | undefined,
  options: ExtractOcrOptions,
): Promise<ExtractResult> {
  const { settings } = options;
  const runner = options.dockerRunner ?? defaultDockerRunner;
  const env = options.env ?? process.env;

  const licenseFail = checkOcrLicense(settings, file.relPath, env);
  if (licenseFail) return licenseFail;

  const maxFromSettings =
    settings.maxInputMb !== undefined
      ? Math.floor(settings.maxInputMb * 1024 * 1024)
      : undefined;
  const maxBytes = maxFromSettings ?? ctx?.maxFileSizeBytes;
  if (maxBytes !== undefined && file.size > maxBytes) {
    return fail(
      "SKIPPED_TOO_LARGE",
      `Skipped OCR for "${file.relPath}" (${file.size} bytes) — over size limit (${maxBytes} bytes). ` +
        `Raise extractor-ocr.maxInputMb or extraction.maxFileSizeMb, or exclude the file, then retry "knot-sync run".`,
    );
  }

  if (ctx?.signal?.aborted) {
    return fail(
      "EXTRACT_TIMEOUT",
      `OCR timed out for "${file.relPath}". Raise extractor-ocr.timeoutSeconds or extraction.timeoutSeconds, then retry "knot-sync run".`,
    );
  }

  const timeoutMs = Math.max(1, Math.floor(settings.timeoutSeconds * 1000));
  // Combine plugin timeout with any host AbortSignal.
  const pluginSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    ctx?.signal !== undefined
      ? AbortSignal.any([ctx.signal, pluginSignal])
      : pluginSignal;

  let outDir: string | undefined;
  try {
    outDir = await mkdtemp(join(tmpdir(), "knot-ocr-"));
    const run = await runner({
      image: settings.image,
      inputAbsPath: file.absPath,
      outputDir: outDir,
      timeoutMs,
      signal,
    });

    if (!run.ok) {
      return fail(run.code, run.message);
    }

    const text = run.markdown.trim();
    if (!text) {
      return fail(
        "EMPTY",
        `OCR produced no text for "${file.relPath}". Check image quality or Docling OCR settings, then retry "knot-sync run".`,
      );
    }

    return { ok: true, document: toDocument(file, run.markdown) };
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (name === "TimeoutError" || name === "AbortError" || signal.aborted) {
      return fail(
        "EXTRACT_TIMEOUT",
        `OCR timed out for "${file.relPath}". Raise extractor-ocr.timeoutSeconds or extraction.timeoutSeconds, then retry "knot-sync run".`,
      );
    }
    return fail(
      "PARSE",
      `OCR failed for "${file.relPath}" (${(err as Error).message || String(err)}). ` +
        `Check Docker and the Docling image, then retry "knot-sync run".`,
    );
  } finally {
    if (outDir) {
      await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
