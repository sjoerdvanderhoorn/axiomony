import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { withDb, pgError } from './db.js';
import * as data from './data.js';
import { explainPermissions } from './permissionExplain.js';
import { visibleTable } from './db.js';
import { buildRestRequest } from './restRequests.js';
import { listRestRelationships } from './restRelationships.js';
import { config } from './config.js';
import { siteList, siteReadFile, siteCreateFile, siteUpdateFile,
  siteDeleteFile, siteDeleteProject } from './siteHosting.js';
import { inspectDatabase, proposeDatabaseChange, reviewDatabaseChange,
  applyDatabaseChange, cancelDatabaseChange } from './admin.js';

const text = (data, isError = false) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], isError
});

const filter = z.object({
  column: z.string().min(1),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is_null', 'not_null']).default('eq'),
  value: z.unknown().optional()
});
const relation = { schema: z.string().min(1), table: z.string().min(1) };
const filters = z.array(filter).max(20).default([]);
const fields = z.record(z.string(), z.unknown());

function safe(tool) {
  return async (args) => {
    try { return text(await tool(args)); }
    catch (error) {
      const message = error?.code ? pgError(error) : error?.message || 'Unknown error.';
      return text({ error: message }, true);
    }
  };
}

export function buildMcpServer(credentials, identity, workspaceSession = 'default') {
  const server = new McpServer({ name: 'Axiomony', version: '0.5.1' });
  const dbTool = fn => safe(args => withDb(credentials, db => fn(db, args)));

  server.registerTool('whoami', {
    description: 'Show the authenticated PostgreSQL user and available tool categories.',
    inputSchema: z.object({})
  }, safe(async () => ({ database: identity.database, username: identity.username,
    administrator: identity.is_admin,
    allowed: { select: identity.can_select, insert: identity.can_insert,
      update: identity.can_update, delete: identity.can_delete } })));

  server.registerTool('list_tables', {
    description: 'List tables accessible to the current database user and their table privileges.',
    inputSchema: z.object({})
  }, dbTool((db) => data.list(db)));

  server.registerTool('describe_table', {
    description: 'Describe an accessible table, visible columns, and effective PostgreSQL column privileges.',
    inputSchema: z.object(relation)
  }, dbTool((db, args) => data.describe(db, args.schema, args.table)));

  server.registerTool('explain_permissions', {
    description: 'Explain table/column privileges, RLS policies, triggers, and constraints for the AUTHENTICATED PostgreSQL user. Optionally check whether a matching row is visible via SELECT. NEVER performs writes and cannot guarantee per-cell UPDATE/DELETE authorization.',
    inputSchema: z.object({ ...relation,
      column: z.string().min(1).optional(),
      action: z.enum(['select', 'insert', 'update', 'delete']),
      filters
    }),
    annotations: { readOnlyHint: true }
  }, dbTool((db, args) => explainPermissions(db, args)));

  // Default architecture for AI-generated task pages: use the existing
  // Data-MCP tools at runtime, rather than constructing direct REST calls.
  server.registerTool('app_integration_guide', {
    description: 'Guide for AI-generated task-specific pages and reports: use Data-MCP through a trusted runtime, not direct PostgREST calls. Explains security requirements for standalone web apps.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  }, safe(async () => ({
    preferred_runtime_data_path: 'AI agent / trusted MCP client -> Data-MCP -> PostgreSQL',
    do_not_use_by_default: 'Generated pages and reporting applications must not call PostgREST directly.',
    discovery_tools: ['list_tables', 'describe_table', 'explain_permissions'],
    optional_static_hosting: {
      enabled: config.appHostingEnabled,
      explanation: 'Publish static HTML, CSS, and JS under user-owned directories using site_create_file, site_update_file, site_read_file, site_list, and site_delete_file. Nginx serves the files without granting direct PostgreSQL REST access.',
      important: 'Published pages are publicly accessible at their URLs. Never place credentials or confidential data in site files. Dynamic data access needs a trusted Data-MCP runtime or secured backend; never embed PostgreSQL passwords in browsers.'
    },
    data_tools: ['select_records', 'insert_record', 'update_records', 'delete_records'],
    implementation_guidance: [
      'Build task-specific UI screens from metadata and field privileges, then use Data-MCP for all actual data operations.',
      'All MCP calls use the authenticated PostgreSQL user; RLS, column privileges, and triggers are authoritative.',
      'Never embed database credentials, tokens, or administrative privileges in generated frontend code.',
      'A standalone browser cannot safely send reusable Basic-auth database credentials to MCP. Use a trusted MCP runtime or a secure backend with user sessions and server-side MCP access.',
      'Never expose administration tools to end-user apps.'
    ],
    existing_optional_legacy_rest: 'PostgREST remains available for explicit legacy integrations, but is not the default route for new AI-generated task pages.',
    warning: 'Public deployments require TLS, OAuth/OIDC sessions, and a secure server-side data route.'
  })));

  // Optional public STATIC hosting, isolated by the verified PostgreSQL login.
  // No caller-controlled username or cross-user management tool exists.
  if (config.appHostingEnabled) {
    const user = identity.username;
    const project = z.string().min(1).max(160);
    const filePath = z.string().min(1).max(600);
    const fileContent = z.string();
    const encoding = z.enum(['utf8', 'base64']).default('utf8');
    server.registerTool('site_list', {
      description: 'List your own published projects, subfolders, files, and public URLs. Project is optional.',
      inputSchema: z.object({ project: project.optional() }),
      annotations: { readOnlyHint: true }
    }, safe(args => siteList(user, args)));
    server.registerTool('site_read_file', {
      description: 'Read a file from your own published project, including content and SHA-256 for conflict-safe updates.',
      inputSchema: z.object({ project, path: filePath }),
      annotations: { readOnlyHint: true }
    }, safe(args => siteReadFile(user, args)));
    server.registerTool('site_create_file', {
      description: 'Publish a NEW file under your own project. Choose a descriptive project name (e.g. invoices or quarterly-reports). Subfolders (assets/, css/, js/) are created automatically. Use index.html as the entry point. Use UTF-8 for text and base64 for images and fonts.',
      inputSchema: z.object({ project, path: filePath, content: fileContent, encoding }),
      annotations: { destructiveHint: false }
    }, safe(args => siteCreateFile(user, args)));
    server.registerTool('site_update_file', {
      description: 'Update an existing file in your own project. Call site_read_file first, then provide expected_sha256 to prevent overwriting a concurrent change.',
      inputSchema: z.object({ project, path: filePath, content: fileContent, encoding,
        expected_sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
      annotations: { destructiveHint: true }
    }, safe(args => siteUpdateFile(user, args)));
    server.registerTool('site_delete_file', {
      description: 'Delete a file from your own project. Optional expected_sha256 prevents deleting a concurrently modified file.',
      inputSchema: z.object({ project, path: filePath,
        expected_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }),
      annotations: { destructiveHint: true }
    }, safe(args => siteDeleteFile(user, args)));
    server.registerTool('site_delete_project', {
      description: 'Delete your own project and all its files and subfolders. Requires explicit confirm=true.',
      inputSchema: z.object({ project, confirm: z.literal(true) }),
      annotations: { destructiveHint: true }
    }, safe(args => siteDeleteProject(user, args)));
  }

  if (config.restMcpToolsEnabled) {
    // Optional backward-compatible REST helpers. AI-generated pages use
    // app_integration_guide and Data-MCP by default.
    server.registerTool('rest_api_guide', {
      description: 'OPTIONAL legacy REST integration: explain direct PostgREST requests. New AI-generated task pages should use app_integration_guide and Data-MCP.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    }, safe(async () => ({
      rest_enabled: config.restEnabled,
      rest_base_url: config.restPublicUrl,
      login: { url: config.restTokenUrl, method: 'POST', authentication: "HTTP Basic with the user\'s OWN PostgreSQL credentials; local development or HTTPS only",
        result: 'access_token (JWT), expires_in: 900, token_type: Bearer',
        important: 'Never embed passwords in frontend source code; do not use admin accounts with REST.' },
      requests: { transport: 'fetch / HTTP directly to PostgREST',
        headers: { Authorization: 'Bearer <access_token>' },
        operations: ['GET', 'POST', 'PATCH', 'DELETE'],
        schemas: config.restSchemas },
      tools: ['list_tables', 'describe_table', 'rest_relationships', 'generate_rest_request'],
      security: 'PostgreSQL GRANT/RLS/triggers enforce authorization; PostgREST connects using a limited authenticator and SET ROLE. MCP is not in the direct REST data path.',
      warnings: ['Development prototype; never expose publicly without TLS, OIDC, rate limiting, and database hardening.',
        'The database administrator must explicitly authorize app users with GRANT <user> TO postgrest_authenticator WITH INHERIT FALSE, SET TRUE.']
    })));

    server.registerTool('rest_relationships', {
      description: 'Show actual PostgreSQL foreign keys between readable tables to help an AI construct REST relationships and PostgREST embeds (joins).',
      inputSchema: z.object({
        schema: z.string().min(1).optional(), table: z.string().min(1).optional()
      }),
      annotations: { readOnlyHint: true }
    }, dbTool(async (db, args) => {
      if (Boolean(args.schema) !== Boolean(args.table)) throw new Error('Specify both schema and table, or omit both.');
      return listRestRelationships(db, config.restSchemas, args.table ? `${args.schema}.${args.table}` : null);
    }));

    server.registerTool('generate_rest_request', {
      description: 'OPTIONAL REST integration: generate a PostgREST URL and fetch example. Not the default for generated pages (use Data-MCP). This tool does not execute queries.',
      inputSchema: z.object({ ...relation,
        operation: z.enum(['select', 'insert', 'update', 'delete']),
        columns: z.array(z.string()).max(100).optional(),
        filters, order_by: z.string().optional(), descending: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(50),
        record: fields.optional()
      }),
      annotations: { readOnlyHint: true }
    }, dbTool(async (db, args) => {
      const table = await visibleTable(db, args.schema, args.table);
      return buildRestRequest(table, args, {
        enabled: config.restEnabled, publicUrl: config.restPublicUrl, tokenUrl: config.restTokenUrl, schemas: config.restSchemas
      });
    }));

  }

  if (identity.can_select) {
    server.registerTool('select_records', {
      description: 'Read up to 100 records from an authorized table. PostgreSQL RLS and column privileges apply. Filters are combined with AND.',
      inputSchema: z.object({ ...relation,
        columns: z.array(z.string()).max(100).optional(), filters,
        order_by: z.string().optional(), descending: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(50)
      }),
      annotations: { readOnlyHint: true }
    }, dbTool(data.select));
  }
  if (identity.can_insert) {
    server.registerTool('insert_record', {
      description: "Insert one record using the current database user\'s effective INSERT privileges.",
      inputSchema: z.object({ ...relation, record: fields }),
      annotations: { destructiveHint: false }
    }, dbTool(data.insert));
  }
  if (identity.can_update) {
    server.registerTool('update_records', {
      description: 'Update records with mandatory filters and max_rows (default 20). PostgreSQL enforces row and column privileges.',
      inputSchema: z.object({ ...relation, values: fields,
        filters: z.array(filter).min(1).max(20), max_rows: z.number().int().min(1).max(100).default(20) })
    }, dbTool(data.update));
  }
  if (identity.can_delete) {
    server.registerTool('delete_records', {
      description: 'Delete records using mandatory filters; table-wide deletion without a filter is forbidden.',
      inputSchema: z.object({ ...relation, filters: z.array(filter).min(1).max(20),
        max_rows: z.number().int().min(1).max(100).default(20) })
    }, dbTool(data.remove));
  }

  // Tools are not even advertised to regular users. Independently check
  // admin authorization inside every handler to prevent tool-call bypass.
  if (identity.is_admin) {
    server.registerTool('inspect_database', {
      description: 'Lees werkelijke PostgreSQL-catalogi: schema, kolommen, RLS, grants, constraints, triggers, functies en comments.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true }
    }, safe(async () => inspectDatabase(credentials)));

    server.registerTool('manage_database', {
      description: 'Accept a natural-language request to change tables, permissions, or business rules. An internal LLM generates PostgreSQL migration SQL. This prepares a proposal only; nothing is executed.',
      inputSchema: z.object({ instruction: z.string().min(5).max(4000) }),
      annotations: { readOnlyHint: true }
    }, safe(({ instruction }) => proposeDatabaseChange(credentials, identity, instruction, workspaceSession)));

    server.registerTool('review_plan', {
      description: 'Review the generated SQL and explanation for a proposed migration before approval.',
      inputSchema: z.object({ plan_id: z.string().uuid() }),
      annotations: { readOnlyHint: true }
    }, safe(({ plan_id }) => reviewDatabaseChange(identity, plan_id, workspaceSession)));

    server.registerTool('implement_plan', {
      description: 'Execute only a previously prepared migration explicitly approved by the administrator. This modifies the real PostgreSQL database.',
      inputSchema: z.object({ plan_id: z.string().uuid(), confirm: z.literal(true) }),
      annotations: { destructiveHint: true }
    }, safe(({ plan_id, confirm }) => applyDatabaseChange(credentials, identity, plan_id, confirm, workspaceSession)));

    server.registerTool('cancel_plan', {
      description: 'Cancel a pending migration plan in server memory without changing the database.',
      inputSchema: z.object({ plan_id: z.string().uuid() }),
      annotations: { readOnlyHint: true }
    }, safe(({ plan_id }) => cancelDatabaseChange(identity, plan_id, workspaceSession)));
  }
  return server;
}
