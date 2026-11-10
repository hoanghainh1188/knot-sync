import { AsyncLocalStorage } from "node:async_hooks";
import type { McpAuthResult } from "@hoanghainh/knot-sync-core";

export type McpAuthOk = Extract<McpAuthResult, { ok: true }>;

const storage = new AsyncLocalStorage<McpAuthOk | undefined>();

/** Run an HTTP/MCP handler with the authenticated principal (if any). */
export function runWithMcpAuthContext<T>(
  auth: McpAuthOk | undefined,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(auth, fn);
}

export function getMcpAuthContext(): McpAuthOk | undefined {
  return storage.getStore();
}

/**
 * Scope check for tools. When `authRequired` is true (HTTP + oauth provider),
 * missing auth context fails closed.
 */
export function assertToolAuthorized(
  toolId: string,
  authorize: ((toolId: string, auth: McpAuthOk) => boolean) | undefined,
  authRequired = false,
): void {
  const auth = getMcpAuthContext();
  if (!authorize) {
    if (authRequired) {
      throw new Error(
        `Forbidden: MCP auth provider is active but no authorizeTool handler is available.`,
      );
    }
    return;
  }
  if (!auth) {
    if (authRequired) {
      throw new Error(
        `Forbidden: missing authenticated session for tool "${toolId}".`,
      );
    }
    return;
  }
  if (!authorize(toolId, auth)) {
    throw new Error(
      `Forbidden: missing scope for tool "${toolId}". ` +
        `Request a token that includes tool:${toolId} or tool:*.`,
    );
  }
}

export function assertResourceAuthorized(
  uri: string,
  authorize: ((uri: string, auth: McpAuthOk) => boolean) | undefined,
  authRequired = false,
): void {
  const auth = getMcpAuthContext();
  if (!authorize) {
    if (authRequired) {
      throw new Error(
        `Forbidden: MCP auth provider is active but no authorizeResource handler is available.`,
      );
    }
    return;
  }
  if (!auth) {
    if (authRequired) {
      throw new Error(`Forbidden: missing authenticated session for resource "${uri}".`);
    }
    return;
  }
  if (!authorize(uri, auth)) {
    throw new Error(
      `Forbidden: missing scope for resource "${uri}". ` +
        `Request a token that includes a matching resource: scope or resource:*.`,
    );
  }
}
