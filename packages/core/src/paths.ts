import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ConfigError } from "./errors.js";
import type { SourceConfig } from "./types.js";

/**
 * Resolve a path for containment checks, following symlinks for the nearest
 * existing ancestor so `logging.path` cannot sneak under a source via a link.
 */
export function resolvePathForContainment(targetPath: string): string {
  const abs = resolve(targetPath);
  const missing: string[] = [];
  let cur = abs;
  while (!existsSync(cur)) {
    missing.unshift(basename(cur));
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  let real = existsSync(cur) ? realpathSync(cur) : cur;
  for (const part of missing) {
    real = join(real, part);
  }
  return real;
}

function normalizeForCompare(p: string): string {
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32") {
    return p.toLowerCase();
  }
  return p;
}

/**
 * Refuse writing an ops file under any configured source root.
 * Returns the absolute target path (logical `resolve`, not realpath) when safe.
 */
export function assertPathOutsideSources(
  targetPath: string,
  sourcePaths: string[],
  options: { key: string; label: string },
): string {
  const abs = resolve(targetPath);
  const realTarget = normalizeForCompare(resolvePathForContainment(abs));
  for (const src of sourcePaths) {
    if (!src) continue;
    const srcReal = normalizeForCompare(resolvePathForContainment(src));
    const prefix = srcReal.endsWith(sep) ? srcReal : srcReal + sep;
    if (realTarget === srcReal || realTarget.startsWith(prefix)) {
      throw new ConfigError(
        `Refusing to write ${options.label} inside source path "${src}". ` +
          `Set ${options.key} to a path outside configured sources.`,
      );
    }
  }
  return abs;
}

/** Absolute filesystem roots for sources that expose a `path` (e.g. fs). */
export function sourceRootPaths(sources: SourceConfig[]): string[] {
  return sources.map((s) => ("path" in s ? String(s.path) : "")).filter(Boolean);
}
