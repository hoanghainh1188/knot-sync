/**
 * Dynamically import an optional native/ODBC module.
 * Returns null when the package is not installed or fails to load.
 */
export async function softImport<T = unknown>(
  moduleId: string,
): Promise<T | null> {
  const { mod } = await softImportWithError<T>(moduleId);
  return mod;
}

/**
 * Like softImport, but surfaces the underlying load error for richer soft-fail text.
 */
export async function softImportWithError<T = unknown>(
  moduleId: string,
): Promise<{ mod: T | null; errorMessage?: string }> {
  try {
    const mod = (await import(moduleId)) as Record<string, unknown>;
    const d = mod.default;
    if (d !== undefined && (typeof d === "object" || typeof d === "function")) {
      const api = d as Record<string, unknown>;
      // CJS interop: API may live on default (Connection / createPool / connect).
      if (api.Connection || api.createPool || api.connect) {
        return { mod: d as T };
      }
    }
    return { mod: mod as T };
  } catch (err) {
    return { mod: null, errorMessage: (err as Error).message };
  }
}

export function missingDriverMessage(
  engine: string,
  moduleId: string,
  extraHint: string,
  detail?: string,
): string {
  const detailPart = detail ? ` Load error: ${detail}.` : "";
  return (
    `${engine} driver module "${moduleId}" is not available.${detailPart} ` +
    `${extraHint} ` +
    `See packages/connector-sql-enterprise/README.md for setup, then retry.`
  );
}
