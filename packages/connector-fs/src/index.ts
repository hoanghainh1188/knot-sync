import { opendir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  extOf,
  isJunkFile,
  sha256File,
  typeFromExt,
  type FileEntry,
  type FsSourceConfig,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";

export interface FsScanOptions {
  /** Compute sha256 of each file (for duplicate detection). Default true. */
  hash?: boolean;
  /** Called for files/folders that cannot be read. Scan continues. */
  onIssue?: (issue: ScanIssue) => void;
}

function issueCode(err: unknown): ScanIssue["code"] {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EACCES" || code === "EPERM" || code === "ENOENT" || code === "EBUSY"
    ? code
    : "OTHER";
}

/**
 * Walk a folder and yield one FileEntry per file.
 *
 * Safety rules:
 * - Read-only: only opendir / stat / read streams.
 * - Symbolic links are skipped (avoids loops and escaping the source root).
 * - Unreadable files/folders are reported via onIssue, never thrown.
 */
export async function* scanFs(
  source: FsSourceConfig,
  options: FsScanOptions = {},
): AsyncGenerator<FileEntry> {
  const doHash = options.hash ?? true;
  const exclude = new Set(source.exclude.map((n) => n.toLowerCase()));
  const extFilter = new Set(source.extensions);

  const report = (path: string, err: unknown) =>
    options.onIssue?.({
      sourceId: source.id,
      path,
      code: issueCode(err),
      message: (err as Error)?.message ?? String(err),
    });

  // Make sure the root exists and is a folder; this one IS fatal.
  const rootStat = await stat(source.path);
  if (!rootStat.isDirectory()) {
    throw new Error(`Source "${source.id}": ${source.path} is not a folder.`);
  }

  const stack: string[] = [source.path];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let handle;
    try {
      handle = await opendir(dir);
    } catch (err) {
      report(dir, err);
      continue;
    }

    const subdirs: string[] = [];
    for await (const dirent of handle) {
      const name = dirent.name;
      if (exclude.has(name.toLowerCase())) continue;
      const absPath = join(dir, name);

      if (dirent.isSymbolicLink()) continue;
      if (dirent.isDirectory()) {
        subdirs.push(absPath);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (isJunkFile(name)) continue;

      const ext = extOf(name);
      if (extFilter.size > 0 && !extFilter.has(ext)) continue;

      let st;
      try {
        st = await stat(absPath);
      } catch (err) {
        report(absPath, err);
        continue;
      }

      let hash: string | null = null;
      if (doHash) {
        try {
          hash = await sha256File(absPath);
        } catch (err) {
          report(absPath, err);
        }
      }

      yield {
        sourceId: source.id,
        absPath,
        relPath: relative(source.path, absPath).split(sep).join("/"),
        ext,
        type: typeFromExt(ext),
        size: st.size,
        mtimeMs: Math.floor(st.mtimeMs),
        hash,
      };
    }
    // Sorted reverse so pop() visits folders in alphabetical order.
    subdirs.sort().reverse();
    stack.push(...subdirs);
  }
}
