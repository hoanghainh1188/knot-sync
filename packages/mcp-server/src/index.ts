export {
  UNTRUSTED_BANNER,
  frameDocument,
  frameSearchHit,
  framedDocumentText,
  type FramedDocumentPayload,
} from "./frame.js";
export { SOURCES_URI, documentUri, parseDocumentUri, type ParsedDocUri } from "./uri.js";
export {
  AuditLog,
  assertAuditPathOutsideSources,
  runWithAuditHttpContext,
  type AuditEntry,
  type AuditHttpContext,
} from "./audit.js";
export {
  API_KEY_ENV,
  checkBearerAuth,
  missingApiKeyMessage,
  readApiKeyFromEnv,
} from "./auth.js";
export {
  runWithMcpAuthContext,
  getMcpAuthContext,
  assertToolAuthorized,
  assertResourceAuthorized,
  type McpAuthOk,
} from "./auth-context.js";
export {
  createMcpToolsPlugin,
  handleGetDocument,
  handleSearchDocuments,
  searchDocumentsInput,
  getDocumentInput,
} from "./tools.js";
export {
  createKnotMcpServer,
  serveStdio,
  type CreateKnotMcpServerOptions,
} from "./server.js";
export {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  MCP_HTTP_PATH,
  isAllowedLoopbackHostHeader,
  serveHttp,
  type ServeHttpOptions,
} from "./http.js";
