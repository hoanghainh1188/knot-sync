/** True when scopes grant the named tool id. */
export function authorizeToolScope(scopes: string[], toolId: string): boolean {
  if (scopes.includes("tool:*")) return true;
  return scopes.includes(`tool:${toolId}`);
}

/**
 * Match resource URI against scope patterns.
 * Supports exact match and trailing `*` prefix patterns (e.g. knot://docs/*).
 */
export function authorizeResourceScope(scopes: string[], uri: string): boolean {
  if (scopes.includes("resource:*")) return true;
  for (const raw of scopes) {
    if (!raw.startsWith("resource:")) continue;
    const pattern = raw.slice("resource:".length);
    if (pattern === uri) return true;
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (uri.startsWith(prefix)) return true;
    }
  }
  return false;
}

export function parseScopeString(scope: string | undefined, fallback: string[]): string[] {
  if (!scope || scope.trim() === "") return [...fallback];
  return scope
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Ensure every requested scope is in the allowlist (`defaultScopes`).
 * Returns null when the client asked for something outside the allowlist.
 */
export function intersectAllowedScopes(
  requested: string[],
  allowed: string[],
): string[] | null {
  const allow = new Set(allowed);
  for (const s of requested) {
    if (!allow.has(s)) return null;
  }
  return requested;
}
