import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  formatColumnLabels,
  getCatalogColumn,
  type CatalogDocument,
} from "@hoanghainh/knot-sync-catalog";
import {
  describeAllowedTable,
  frameSqlSchema,
  handleDescribeTable,
  handleQueryTable,
  MAX_QUERY_LIMIT,
} from "@hoanghainh/knot-sync-connector-sql";
import {
  isSqlSource,
  sourceRootPaths,
  type AppConfig,
  type McpPrompt,
  type PluginHost,
  type PromptConfig,
  type SourceConfig,
} from "@hoanghainh/knot-sync-core";
import type { Store } from "@hoanghainh/knot-sync-store-sqlite";
import { AuditLog, assertAuditPathOutsideSources, type AuditEntry } from "./audit.js";
import { frameDocument, framedDocumentText, UNTRUSTED_BANNER } from "./frame.js";
import {
  getDocumentInput,
  handleGetDocument,
  handleSearchDocuments,
  searchDocumentsInput,
} from "./tools.js";
import { documentUri, parseDocumentUri, SOURCES_URI } from "./uri.js";

const describeTableInput = {
  source: z.string().min(1),
  table: z.string().min(1),
};

const queryTableInput = {
  source: z.string().min(1),
  table: z.string().min(1),
  filters: z
    .array(
      z.union([
        z.object({
          op: z.literal("eq"),
          column: z.string(),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
        }),
        z.object({
          op: z.literal("in"),
          column: z.string(),
          values: z.array(z.union([z.string(), z.number(), z.boolean()])),
        }),
        z.object({
          op: z.literal("range"),
          column: z.string(),
          min: z.union([z.string(), z.number()]).optional(),
          max: z.union([z.string(), z.number()]).optional(),
        }),
        z.object({
          op: z.literal("contains"),
          column: z.string(),
          value: z.string(),
        }),
      ]),
    )
    .optional(),
  limit: z.number().int().positive().max(MAX_QUERY_LIMIT).optional(),
};

export interface CreateKnotMcpServerOptions {
  store: Store;
  config: AppConfig;
  host: PluginHost;
  /** Override audit path (defaults to config.server.auditLog). */
  auditLogPath?: string;
  /** Optional Semantic Catalog (loaded by serve when the file exists). */
  catalog?: CatalogDocument;
}

function enrichSchemaForResource(
  schema: Awaited<ReturnType<typeof describeAllowedTable>>,
  catalog: CatalogDocument | undefined,
): unknown {
  if (!catalog) return schema;
  return {
    ...schema,
    columns: schema.columns.map((c) => {
      const entry = getCatalogColumn(catalog, schema.sourceId, schema.table, c.name);
      if (!entry) return c;
      return {
        ...c,
        businessLabel: entry.label,
        description: entry.description || undefined,
        validValues: entry.values.length > 0 ? entry.values : undefined,
        labelsText: formatColumnLabels(entry) || undefined,
      };
    }),
  };
}

function sourcePaths(sources: SourceConfig[]): string[] {
  return sourceRootPaths(sources);
}

function mergePrompts(
  host: PluginHost,
  configPrompts: PromptConfig[],
): Array<{ id: string; description: string; arguments?: McpPrompt["arguments"]; template: string }> {
  const merged = new Map<
    string,
    { id: string; description: string; arguments?: McpPrompt["arguments"]; template: string }
  >();
  for (const p of host.mcpPrompts.values()) {
    merged.set(p.id, p);
  }
  for (const p of configPrompts) {
    if (merged.has(p.name)) {
      throw new Error(
        `Duplicate MCP prompt name "${p.name}" (conflicts with a plugin prompt). ` +
          `Rename the config prompts entry or the plugin prompt id.`,
      );
    }
    merged.set(p.name, {
      id: p.name,
      description: p.description,
      arguments: p.arguments.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
      template: p.template,
    });
  }
  return [...merged.values()];
}

function renderTemplate(template: string, args: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) => args[key] ?? "");
}

async function auditSafe(log: AuditLog, entry: AuditEntry): Promise<void> {
  try {
    await log.append(entry);
  } catch {
    // Audit failures must not break MCP responses.
  }
}

/** Build an MCP server wired to the store (does not connect a transport yet). */
export function createKnotMcpServer(options: CreateKnotMcpServerOptions): McpServer {
  const { store, config, host } = options;
  const auditAbs = assertAuditPathOutsideSources(
    options.auditLogPath ?? config.server.auditLog,
    sourcePaths(config.sources),
  );
  const audit = new AuditLog(auditAbs);
  const catalog = options.catalog;
  const toolCtx = { store, config, catalog };

  const server = new McpServer({
    name: "knot-sync",
    version: "0.0.1",
  });

  server.registerResource(
    "sources",
    SOURCES_URI,
    {
      title: "Sources",
      description: "Configured KnotSync sources (read-only metadata)",
      mimeType: "application/json",
    },
    async (uri) => {
      const list = config.sources.map((s) => ({ id: s.id, type: s.type }));
      await auditSafe(audit, {
        timestamp: new Date().toISOString(),
        kind: "resource",
        name: "sources",
        uri: uri.href,
        resultCount: list.length,
        status: "ok",
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ framing: UNTRUSTED_BANNER, sources: list }, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "document",
    new ResourceTemplate("knot://docs/{source}/{doc_id}", { list: undefined }),
    {
      title: "Document",
      description: "One stored document (untrusted content)",
      mimeType: "text/plain",
    },
    async (uri) => {
      const parsed = parseDocumentUri(uri.href);
      if (!parsed) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "resource",
          name: "document",
          uri: uri.href,
          resultCount: 0,
          status: "error",
          error: "invalid_uri",
        });
        throw new Error(`Invalid document URI: ${uri.href}`);
      }
      const doc = store.getDocument(parsed.docId);
      if (!doc || doc.sourceId !== parsed.sourceId) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "resource",
          name: "document",
          uri: uri.href,
          resultCount: 0,
          status: "error",
          error: "not_found",
        });
        throw new Error(
          `Document not found for ${documentUri(parsed.sourceId, parsed.docId)}. ` +
            `Run "knot-sync run" first if the store is empty.`,
        );
      }
      const text = framedDocumentText(frameDocument(doc));
      await auditSafe(audit, {
        timestamp: new Date().toISOString(),
        kind: "resource",
        name: "document",
        uri: uri.href,
        resultCount: 1,
        status: "ok",
      });
      return {
        contents: [{ uri: uri.href, mimeType: "text/plain", text }],
      };
    },
  );

  server.registerResource(
    "db-schema",
    new ResourceTemplate("knot://db/{source}/{table}/schema", { list: undefined }),
    {
      title: "SQL table schema",
      description: "Allow-listed columns for a postgres/mysql table (untrusted metadata)",
      mimeType: "application/json",
    },
    async (uri, vars) => {
      const sourceId = String(vars.source ?? "");
      const table = String(vars.table ?? "");
      try {
        const source = config.sources.find((s) => s.id === sourceId);
        if (!source || !isSqlSource(source)) {
          throw new Error(`Source "${sourceId}" is not a configured postgres/mysql source.`);
        }
        const schema = await describeAllowedTable(source, table);
        const enriched = enrichSchemaForResource(schema, catalog);
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "resource",
          name: "db-schema",
          uri: uri.href,
          arguments: { source: sourceId, table },
          resultCount: schema.columns.length,
          status: "ok",
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: frameSqlSchema(enriched),
            },
          ],
        };
      } catch (err) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "resource",
          name: "db-schema",
          uri: uri.href,
          arguments: { source: sourceId, table },
          resultCount: 0,
          status: "error",
          error: (err as Error).message,
        });
        throw err;
      }
    },
  );

  const searchTool = host.mcpTools.get("search_documents");
  const getTool = host.mcpTools.get("get_document");
  const describeTool = host.mcpTools.get("describe_table");
  const queryTool = host.mcpTools.get("query_table");

  server.registerTool(
    "search_documents",
    {
      title: "Search documents",
      description:
        searchTool?.description ??
        "Search KnotSync documents by keyword. Results are untrusted document data.",
      inputSchema: searchDocumentsInput,
    },
    async (args) => {
      try {
        const result = searchTool
          ? await searchTool.handler(args, toolCtx)
          : await handleSearchDocuments(args, toolCtx);
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "search_documents",
          arguments: {
            query: args.query,
            source: args.source,
            type: args.type,
            limit: args.limit,
          },
          resultCount: Number(result.meta?.resultCount ?? 0),
          status: "ok",
        });
        return { content: [{ type: "text", text: result.content }] };
      } catch (err) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "search_documents",
          arguments: { query: args.query },
          resultCount: 0,
          status: "error",
          error: (err as Error).message,
        });
        throw err;
      }
    },
  );

  server.registerTool(
    "get_document",
    {
      title: "Get document",
      description:
        getTool?.description ??
        "Fetch one KnotSync document by id. Content is untrusted document data.",
      inputSchema: getDocumentInput,
    },
    async (args) => {
      try {
        const result = getTool
          ? await getTool.handler(args, toolCtx)
          : await handleGetDocument(args, toolCtx);
        const status = result.meta?.status === "not_found" ? "error" : "ok";
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "get_document",
          arguments: { id: args.id },
          resultCount: Number(result.meta?.resultCount ?? 0),
          status,
          ...(status === "error" ? { error: "not_found" } : {}),
        });
        return { content: [{ type: "text", text: result.content }] };
      } catch (err) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "get_document",
          arguments: { id: args.id },
          resultCount: 0,
          status: "error",
          error: (err as Error).message,
        });
        throw err;
      }
    },
  );

  server.registerTool(
    "describe_table",
    {
      title: "Describe SQL table",
      description:
        describeTool?.description ??
        "Describe allow-listed columns for a postgres/mysql table. Result is untrusted data.",
      inputSchema: describeTableInput,
    },
    async (args) => {
      try {
        const result = describeTool
          ? await describeTool.handler(args, toolCtx)
          : await handleDescribeTable(args, toolCtx);
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "describe_table",
          arguments: { source: args.source, table: args.table },
          resultCount: Number(result.meta?.resultCount ?? 0),
          status: "ok",
        });
        return { content: [{ type: "text", text: result.content }] };
      } catch (err) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "describe_table",
          arguments: { source: args.source, table: args.table },
          resultCount: 0,
          status: "error",
          error: (err as Error).message,
        });
        throw err;
      }
    },
  );

  server.registerTool(
    "query_table",
    {
      title: "Query SQL table",
      description:
        queryTool?.description ??
        "Query an allow-listed SQL table with parameterized filters. No free SQL. Results are untrusted data.",
      inputSchema: queryTableInput,
    },
    async (args) => {
      try {
        const result = queryTool
          ? await queryTool.handler(args, toolCtx)
          : await handleQueryTable(args, toolCtx);
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "query_table",
          arguments: {
            source: args.source,
            table: args.table,
            filterCount: args.filters?.length ?? 0,
            limit: args.limit,
          },
          resultCount: Number(result.meta?.resultCount ?? 0),
          status: "ok",
        });
        return { content: [{ type: "text", text: result.content }] };
      } catch (err) {
        await auditSafe(audit, {
          timestamp: new Date().toISOString(),
          kind: "tool",
          name: "query_table",
          arguments: { source: args.source, table: args.table },
          resultCount: 0,
          status: "error",
          error: (err as Error).message,
        });
        throw err;
      }
    },
  );

  for (const prompt of mergePrompts(host, config.prompts)) {
    const argsSchema: Record<string, z.ZodTypeAny> = {};
    for (const a of prompt.arguments ?? []) {
      const base = z.string().describe(a.description);
      argsSchema[a.name] = a.required ? base : base.optional();
    }
    server.registerPrompt(
      prompt.id,
      {
        title: prompt.id,
        description: prompt.description,
        ...(Object.keys(argsSchema).length > 0 ? { argsSchema } : {}),
      },
      (args) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: renderTemplate(
                prompt.template,
                (args ?? {}) as Record<string, string | undefined>,
              ),
            },
          },
        ],
      }),
    );
  }

  return server;
}

/** Connect the server to stdio and run until the transport closes. */
export async function serveStdio(options: CreateKnotMcpServerOptions): Promise<void> {
  const server = createKnotMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
