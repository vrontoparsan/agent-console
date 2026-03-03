import { prisma } from "@/lib/prisma";
import { tenantPrisma, getTenantSchema } from "@/lib/prisma-tenant";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import * as fs from "fs";
import * as path from "path";
import { compileJSX } from "@/lib/instance/compile";

// All models accessible through the agent
const ALLOWED_MODELS: Record<string, string> = {
  event: "Event",
  user: "User",
  eventaction: "EventAction",
  message: "Message",
  eventcategory: "EventCategory",
  agentcontext: "AgentContext",
  cronjob: "CronJob",
  emailaccount: "EmailAccount",
  custompage: "CustomPage",
};

// Fields that must never be returned or modified
const SENSITIVE_FIELDS: Record<string, string[]> = {
  user: ["password"],
  emailaccount: ["imapPassword", "smtpPassword"],
};

function resolveModel(tableName: string): string | null {
  const key = tableName.toLowerCase().replace(/[_\s]/g, "");
  return ALLOWED_MODELS[key] || null;
}

function getTenantModel(tenantId: string, modelName: string) {
  const db = tenantPrisma(tenantId);
  const key = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (db as any)[key];
}

function sanitizeRecord(modelName: string, record: Record<string, unknown>): Record<string, unknown> {
  const key = modelName.toLowerCase().replace(/[_\s]/g, "");
  const sensitive = SENSITIVE_FIELDS[key];
  if (!sensitive) return record;
  const clean = { ...record };
  for (const field of sensitive) {
    if (field in clean) clean[field] = "***";
  }
  return clean;
}

function sanitizeData(modelName: string, data: Record<string, unknown>): Record<string, unknown> {
  const key = modelName.toLowerCase().replace(/[_\s]/g, "");
  const sensitive = SENSITIVE_FIELDS[key];
  if (!sensitive) return data;
  const clean = { ...data };
  for (const field of sensitive) {
    delete clean[field]; // Don't allow writing to sensitive fields
  }
  return clean;
}

export function getDbTools(): Tool[] {
  return [
    {
      name: "query_data",
      description: "Query records from a database table with optional filtering, sorting, and pagination. Always use pagination for large tables. Default limit is 20.",
      input_schema: {
        type: "object" as const,
        properties: {
          table: { type: "string", description: "Table name (e.g. Event, User, EventCategory)" },
          where: { type: "object", description: "Prisma-compatible where filter (e.g. {status: 'NEW'} or {title: {contains: 'search'}})" },
          select: { type: "object", description: "Fields to select (e.g. {id: true, title: true}). Omit for all fields." },
          orderBy: { type: "object", description: "Sort order (e.g. {createdAt: 'desc'})" },
          limit: { type: "number", description: "Max records to return (default 20, max 100)" },
          offset: { type: "number", description: "Skip N records for pagination" },
        },
        required: ["table"],
      },
    },
    {
      name: "count_records",
      description: "Count records in a table matching optional filter criteria.",
      input_schema: {
        type: "object" as const,
        properties: {
          table: { type: "string", description: "Table name" },
          where: { type: "object", description: "Prisma-compatible where filter" },
        },
        required: ["table"],
      },
    },
    {
      name: "create_record",
      description: "Create a new record in a database table.",
      input_schema: {
        type: "object" as const,
        properties: {
          table: { type: "string", description: "Table name" },
          data: { type: "object", description: "Record data as key-value pairs" },
        },
        required: ["table", "data"],
      },
    },
    {
      name: "update_records",
      description: "Update records matching a where filter. MANAGER users can only update up to 3 records at a time.",
      input_schema: {
        type: "object" as const,
        properties: {
          table: { type: "string", description: "Table name" },
          where: { type: "object", description: "Prisma-compatible where filter to match records" },
          data: { type: "object", description: "Fields to update" },
        },
        required: ["table", "where", "data"],
      },
    },
    {
      name: "delete_records",
      description: "Delete records matching a where filter. Only ADMIN can use this.",
      input_schema: {
        type: "object" as const,
        properties: {
          table: { type: "string", description: "Table name" },
          where: { type: "object", description: "Prisma-compatible where filter" },
        },
        required: ["table", "where"],
      },
    },
  ];
}

export function getPageTools(): Tool[] {
  return [
    {
      name: "create_page",
      description: `Create a new custom UI page. The config is a JSON object defining the page layout and components.

Available component types:
- "data-table": Sortable, filterable, paginated table. Props: table (DB table name), columns (array of {key, label, sortable?}), filters (array of {key, label, type: "text"|"select", options?}), pageSize, actions (array of "create"|"edit"|"delete")
- "form": Input form for creating/editing records. Props: table, fields (array of {key, label, type: "text"|"number"|"select"|"textarea"|"date"|"boolean", options?, required?})
- "stats": KPI metric cards. Props: items (array of {label, table, where?, type: "count"|"sum", field?})
- "text": Static markdown content. Props: content (markdown string)

Config structure:
{
  "layout": "stack" | "grid-2" | "grid-3",
  "components": [{ "id": "unique-id", "type": "...", "title": "...", "props": {...} }]
}`,
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "URL slug (lowercase, hyphens, e.g. 'warehouse')" },
          title: { type: "string", description: "Page title shown in menu" },
          icon: { type: "string", description: "Lucide icon name (e.g. 'Package', 'Users', 'Calendar')" },
          config: { type: "object", description: "Page config with layout and components" },
          published: { type: "boolean", description: "Whether the page is visible in the menu (default true)" },
        },
        required: ["slug", "title", "config"],
      },
    },
    {
      name: "update_page",
      description: "Update an existing custom page's config, title, icon, or published status.",
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Page slug to update" },
          title: { type: "string" },
          icon: { type: "string" },
          config: { type: "object", description: "New page config (replaces entire config)" },
          published: { type: "boolean" },
        },
        required: ["slug"],
      },
    },
    {
      name: "get_page",
      description: "Get the current config of a custom page by slug.",
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string" },
        },
        required: ["slug"],
      },
    },
    {
      name: "list_pages",
      description: "List all custom pages with their slugs, titles, and published status.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "delete_page",
      description: "Delete a custom page by slug.",
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string" },
        },
        required: ["slug"],
      },
    },
  ];
}

export async function executeDbTool(
  name: string,
  input: Record<string, unknown>,
  userRole: string,
  tenantId: string
): Promise<string> {
  switch (name) {
    case "query_data": {
      const modelName = resolveModel(input.table as string);
      if (!modelName) return `Error: Unknown table "${input.table}". Use one of: ${Object.values(ALLOWED_MODELS).join(", ")}`;
      const model = getTenantModel(tenantId, modelName);
      const limit = Math.min(Number(input.limit) || 20, 100);
      const offset = Number(input.offset) || 0;

      const args: Record<string, unknown> = {
        where: input.where || {},
        take: limit,
        skip: offset,
      };
      if (input.select) args.select = input.select;
      if (input.orderBy) args.orderBy = input.orderBy;

      try {
        const records = await model.findMany(args);
        const sanitized = records.map((r: Record<string, unknown>) => sanitizeRecord(modelName, r));
        return JSON.stringify({ count: sanitized.length, offset, limit, data: sanitized }, null, 2);
      } catch (err) {
        return `Error querying ${modelName}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "count_records": {
      const modelName = resolveModel(input.table as string);
      if (!modelName) return `Error: Unknown table "${input.table}"`;
      const model = getTenantModel(tenantId, modelName);
      try {
        const count = await model.count({ where: input.where || {} });
        return JSON.stringify({ table: modelName, count });
      } catch (err) {
        return `Error counting ${modelName}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "create_record": {
      const modelName = resolveModel(input.table as string);
      if (!modelName) return `Error: Unknown table "${input.table}"`;
      const model = getTenantModel(tenantId, modelName);
      const data = sanitizeData(modelName, input.data as Record<string, unknown>);
      try {
        const record = await model.create({ data });
        return JSON.stringify({ created: sanitizeRecord(modelName, record) }, null, 2);
      } catch (err) {
        return `Error creating record in ${modelName}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "update_records": {
      const modelName = resolveModel(input.table as string);
      if (!modelName) return `Error: Unknown table "${input.table}"`;
      const model = getTenantModel(tenantId, modelName);
      const data = sanitizeData(modelName, input.data as Record<string, unknown>);
      const where = input.where as Record<string, unknown>;

      // Permission check: MANAGER can only update ≤3 records
      if (userRole === "MANAGER") {
        const count = await model.count({ where });
        if (count > 3) {
          return `Error: MANAGER role can only update up to 3 records at a time. This query matches ${count} records. Ask an ADMIN to perform bulk updates.`;
        }
      }

      try {
        const result = await model.updateMany({ where, data });
        return JSON.stringify({ updated: result.count, table: modelName });
      } catch (err) {
        return `Error updating ${modelName}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "delete_records": {
      if (userRole !== "ADMIN") {
        return "Error: Only ADMIN can delete records.";
      }
      const modelName = resolveModel(input.table as string);
      if (!modelName) return `Error: Unknown table "${input.table}"`;
      const model = getTenantModel(tenantId, modelName);
      try {
        const result = await model.deleteMany({ where: input.where || {} });
        return JSON.stringify({ deleted: result.count, table: modelName });
      } catch (err) {
        return `Error deleting from ${modelName}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    default:
      return `Error: Unknown tool "${name}"`;
  }
}

export async function executePageTool(
  name: string,
  input: Record<string, unknown>,
  tenantId: string
): Promise<string> {
  const db = tenantPrisma(tenantId);

  switch (name) {
    case "create_page": {
      try {
        const page = await db.customPage.create({
          data: {
            slug: input.slug as string,
            title: input.title as string,
            icon: (input.icon as string) || null,
            config: input.config as object,
            published: input.published !== false,
          },
        });
        return JSON.stringify({ created: { slug: page.slug, title: page.title, id: page.id } });
      } catch (err) {
        return `Error creating page: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "update_page": {
      const slug = input.slug as string;
      const data: Record<string, unknown> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.icon !== undefined) data.icon = input.icon;
      if (input.config !== undefined) data.config = input.config;
      if (input.published !== undefined) data.published = input.published;

      try {
        const page = await db.customPage.update({
          where: { slug_tenantId: { slug, tenantId } },
          data,
        });
        return JSON.stringify({ updated: { slug: page.slug, title: page.title } });
      } catch (err) {
        return `Error updating page: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "get_page": {
      try {
        const page = await db.customPage.findFirst({
          where: { slug: input.slug as string },
        });
        if (!page) return `Error: Page "${input.slug}" not found`;
        return JSON.stringify(page, null, 2);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "list_pages": {
      const pages = await db.customPage.findMany({
        select: { slug: true, title: true, icon: true, published: true, order: true },
        orderBy: { order: "asc" },
      });
      return JSON.stringify(pages, null, 2);
    }

    case "delete_page": {
      try {
        const page = await db.customPage.findFirst({
          where: { slug: input.slug as string },
        });
        if (!page) return `Error: Page "${input.slug}" not found`;
        await db.customPage.delete({ where: { id: page.id } });
        return JSON.stringify({ deleted: input.slug });
      } catch (err) {
        return `Error deleting page: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    default:
      return `Error: Unknown page tool "${name}"`;
  }
}

export function getSqlTools(): Tool[] {
  return [
    {
      name: "execute_sql",
      description: `Execute raw SQL against the database. ADMIN only. Use for:
- CREATE TABLE: Create new custom tables for custom page sections (e.g. orders, vacations)
- ALTER TABLE: Add/modify columns on existing custom tables
- INSERT INTO: Seed initial data into custom tables
- SELECT: Query custom tables that are not Prisma models
- UPDATE/DELETE: Modify data in custom tables

Rules:
- Never modify core Prisma-managed tables (User, Event, EventCategory, EmailAccount, etc.)
- Table names for custom tables MUST be prefixed with "cstm_" (e.g. cstm_orders, cstm_vacations)
- Always use snake_case for column names
- Include id (TEXT PRIMARY KEY DEFAULT gen_random_uuid()), created_at (TIMESTAMPTZ DEFAULT NOW()), updated_at (TIMESTAMPTZ DEFAULT NOW()) in every new table
- Use standard PostgreSQL types: TEXT, INTEGER, NUMERIC, BOOLEAN, TIMESTAMPTZ, JSONB`,
      input_schema: {
        type: "object" as const,
        properties: {
          sql: { type: "string", description: "The SQL statement to execute" },
          params: {
            type: "array",
            description: "Optional positional parameters for $1, $2, etc.",
            items: {},
          },
        },
        required: ["sql"],
      },
    },
  ];
}

const CORE_TABLES = [
  "user", "event", "eventcategory", "emailaccount", "usercategoryaccess",
  "useremailaccountaccess", "userpageaccess", "eventaction", "message",
  "agentcontext", "companyinfo", "custompage", "cronjob", "tenant",
  "_prisma_migrations",
];

// Rewrite unqualified cstm_ / custom_ table references to the tenant's schema.
function qualifyInstanceTables(sql: string, tenantSchema: string): string {
  const escaped = tenantSchema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sql.replace(
    new RegExp(`(?<!${escaped}\\.)(?<![a-z0-9_])((?:cstm_|custom_)[a-z0-9_]+)`, "gi"),
    `${tenantSchema}.$1`
  );
}

export async function executeSqlTool(
  input: Record<string, unknown>,
  userRole: string,
  tenantId: string
): Promise<string> {
  if (userRole !== "ADMIN") {
    return "Error: Only ADMIN can execute raw SQL.";
  }

  const tenantSchema = getTenantSchema(tenantId);
  const rawSql = (input.sql as string).trim();
  // Auto-qualify cstm_*/custom_* table refs to tenant schema
  const sql = qualifyInstanceTables(rawSql, tenantSchema);
  const params = (input.params as unknown[]) || [];

  // Block modifications to core tables
  const sqlLower = sql.toLowerCase();
  const isDDL = sqlLower.startsWith("alter table") || sqlLower.startsWith("drop table") || sqlLower.startsWith("truncate");
  if (isDDL) {
    // Extract table name from DDL
    const tableMatch = sqlLower.match(/(?:alter|drop|truncate)\s+table\s+(?:if\s+exists\s+)?["']?(\w+)["']?/);
    if (tableMatch) {
      const tableName = tableMatch[1].toLowerCase();
      if (!tableName.startsWith("cstm_") && !tableName.startsWith("custom_") && CORE_TABLES.includes(tableName)) {
        return `Error: Cannot modify core table "${tableMatch[1]}". Only tables prefixed with "cstm_" can be altered/dropped.`;
      }
    }
  }

  try {
    if (sqlLower.startsWith("select") || sqlLower.startsWith("with")) {
      const result = await prisma.$queryRawUnsafe(sql, ...params);
      const rows = result as Record<string, unknown>[];
      return JSON.stringify({ rows: rows.slice(0, 100), count: rows.length }, null, 2);
    } else {
      const result = await prisma.$executeRawUnsafe(sql, ...params);
      return JSON.stringify({ affected: result, sql: sql.slice(0, 200) });
    }
  } catch (err) {
    return `SQL Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ─── Instance Page Tools ─────────────────────────────────────

const SDK_REFERENCE = `SDK scope: React (useState, useEffect, useCallback, useMemo), useCstmQuery, useCstmMutation, useAI, sdk.*, Button, Input, Badge, Card/CardHeader/CardTitle/CardDescription/CardContent, DataTable, StatCard, Select, Tabs, LoadingSpinner, EmptyState.
Code MUST be responsive (mobile + desktop) and end with: var __default__ = ComponentName;
Full SDK reference is in the system prompt.`;

export function getInstancePageTools(): Tool[] {
  return [
    {
      name: "create_instance_page",
      description: `Create a new Instance page with custom React JSX code. Instance pages use the SDK for data, AI, and UI.

${SDK_REFERENCE}`,
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "URL slug (lowercase, hyphens)" },
          title: { type: "string", description: "Page title for sidebar menu" },
          icon: { type: "string", description: "Lucide icon name (e.g. 'Package', 'Users')" },
          code: { type: "string", description: "React JSX code using SDK. Must end with var __default__ = ComponentName;" },
          published: { type: "boolean", description: "Show in sidebar (default true)" },
        },
        required: ["slug", "title", "code"],
      },
    },
    {
      name: "update_instance_page_code",
      description: `Update the JSX code of an existing Instance page.

${SDK_REFERENCE}`,
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string", description: "Page slug to update" },
          code: { type: "string", description: "New JSX code" },
          title: { type: "string" },
          icon: { type: "string" },
          published: { type: "boolean", description: "Set page visibility in sidebar" },
        },
        required: ["slug", "code"],
      },
    },
    {
      name: "get_instance_page",
      description: "Get the current JSX code of an Instance page by slug. ALWAYS use this before modifying an existing page.",
      input_schema: {
        type: "object" as const,
        properties: {
          slug: { type: "string" },
        },
        required: ["slug"],
      },
    },
    {
      name: "verify_instance_code",
      description: `Verify that Instance page JSX code compiles successfully. Runs Sucrase compilation + security checks.
MANDATORY: Call this AFTER every create_instance_page or update_instance_page_code. If it returns errors, fix the code and update again, then verify again.
Returns { ok: true } on success, or { ok: false, error: "..." } with the compilation error message.`,
      input_schema: {
        type: "object" as const,
        properties: {
          code: { type: "string", description: "The JSX code to verify" },
        },
        required: ["code"],
      },
    },
    {
      name: "list_instance_pages_code",
      description: `List existing Instance pages with their code snippets. Use this BEFORE creating a new page to learn existing patterns, naming conventions, and styling. Helps maintain consistency across pages.`,
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "create_snapshot",
      description: `Create a snapshot of the current state of all Instance pages and custom database tables.
Call this AFTER making changes to page code or database tables.
The label should describe what was changed (e.g. "Added price column to products table" or "Redesigned orders dashboard with filters").`,
      input_schema: {
        type: "object" as const,
        properties: {
          label: { type: "string", description: "Short description of what changed" },
        },
        required: ["label"],
      },
    },
    {
      name: "introspect_table",
      description: `Get the column schema of a custom table. Returns column names, data types, and defaults. Use this before writing code that references a custom table to ensure you use correct column names and types.`,
      input_schema: {
        type: "object" as const,
        properties: {
          table: { type: "string", description: "Table name (e.g. cstm_orders). Must start with cstm_" },
        },
        required: ["table"],
      },
    },
  ];
}

const MAX_CODE_SIZE = 50_000;

export async function executeInstancePageTool(
  name: string,
  input: Record<string, unknown>,
  tenantId: string
): Promise<string> {
  const db = tenantPrisma(tenantId);
  const tenantSchema = getTenantSchema(tenantId);

  switch (name) {
    case "create_instance_page": {
      const code = input.code as string;
      if (code.length > MAX_CODE_SIZE) {
        return `Error: Code exceeds maximum size of ${MAX_CODE_SIZE} characters`;
      }
      try {
        const page = await db.customPage.create({
          data: {
            slug: input.slug as string,
            title: input.title as string,
            icon: (input.icon as string) || null,
            code,
            config: {},
            published: input.published !== false,
          },
        });
        return JSON.stringify({ created: { slug: page.slug, title: page.title, id: page.id } });
      } catch (err) {
        return `Error creating instance page: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "update_instance_page_code": {
      const code = input.code as string;
      if (code.length > MAX_CODE_SIZE) {
        return `Error: Code exceeds maximum size of ${MAX_CODE_SIZE} characters`;
      }
      const data: Record<string, unknown> = { code };
      if (input.title !== undefined) data.title = input.title;
      if (input.icon !== undefined) data.icon = input.icon;
      if (input.published !== undefined) data.published = input.published;
      try {
        const page = await db.customPage.findFirst({
          where: { slug: input.slug as string },
        });
        if (!page) return `Error: Page "${input.slug}" not found`;
        const updated = await db.customPage.update({
          where: { id: page.id },
          data,
        });
        return JSON.stringify({ updated: { slug: updated.slug, title: updated.title } });
      } catch (err) {
        return `Error updating instance page: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "get_instance_page": {
      try {
        const page = await db.customPage.findFirst({
          where: { slug: input.slug as string },
        });
        if (!page) return `Error: Page "${input.slug}" not found`;
        return JSON.stringify(
          { slug: page.slug, title: page.title, code: page.code, config: page.config },
          null,
          2
        );
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "verify_instance_code": {
      const code = input.code as string;
      if (!code || code.trim().length === 0) {
        return JSON.stringify({ ok: false, error: "Empty code provided" });
      }
      const result = compileJSX(code);
      if (result.ok) {
        // Also check for __default__ export
        if (!code.includes("__default__")) {
          return JSON.stringify({
            ok: false,
            error: 'Code compiles but is missing the required export. Add: var __default__ = ComponentName;',
          });
        }
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({ ok: false, error: result.error });
    }

    case "list_instance_pages_code": {
      try {
        const pages = await db.customPage.findMany({
          where: { code: { not: null } },
          select: { slug: true, title: true, code: true },
          orderBy: { updatedAt: "desc" },
          take: 5,
        });
        const result = pages.map((p) => {
          const lines = (p.code || "").split("\n");
          const preview = lines.slice(0, 150).join("\n");
          const truncated = lines.length > 150;
          return {
            slug: p.slug,
            title: p.title,
            codePreview: preview + (truncated ? "\n// ... (truncated)" : ""),
          };
        });
        if (result.length === 0) {
          return JSON.stringify({ pages: [], note: "No existing Instance pages found. You are creating the first one." });
        }
        return JSON.stringify({ pages: result }, null, 2);
      } catch (err) {
        return `Error listing pages: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "introspect_table": {
      const table = input.table as string;
      if (!table.startsWith("cstm_")) {
        return `Error: Only custom tables (cstm_ prefix) can be introspected.`;
      }
      try {
        const columns = await prisma.$queryRawUnsafe<
          { column_name: string; data_type: string; column_default: string | null; is_nullable: string }[]
        >(
          `SELECT column_name, data_type, column_default, is_nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          tenantSchema,
          table
        );
        if (columns.length === 0) {
          return `Error: Table "${table}" not found in tenant schema.`;
        }
        return JSON.stringify({ table, columns }, null, 2);
      } catch (err) {
        return `Error introspecting table: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    default:
      return `Error: Unknown instance page tool "${name}"`;
  }
}

export async function getSchemaContext(tenantId: string): Promise<string> {
  const tenantSchema = getTenantSchema(tenantId);

  // Read prisma schema
  let schema = "";
  try {
    schema = fs.readFileSync(path.join(process.cwd(), "prisma/schema.prisma"), "utf-8");
  } catch {
    schema = "(schema file not readable)";
  }

  // Get row counts for all tables (tenant-scoped)
  const counts: Record<string, number> = {};
  for (const [, modelName] of Object.entries(ALLOWED_MODELS)) {
    try {
      const model = getTenantModel(tenantId, modelName);
      counts[modelName] = await model.count();
    } catch {
      counts[modelName] = -1;
    }
  }

  // Discover custom tables in tenant's schema
  let customTables = "";
  try {
    const tables = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(
      `SELECT t.table_name, c.column_name, c.data_type
       FROM information_schema.tables t
       JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
       WHERE t.table_schema = $1 AND (t.table_name LIKE 'cstm_%' OR t.table_name LIKE 'custom_%')
       ORDER BY t.table_name, c.ordinal_position`,
      tenantSchema
    );
    if (tables.length > 0) {
      const grouped: Record<string, { column_name: string; data_type: string }[]> = {};
      for (const row of tables) {
        if (!grouped[row.table_name]) grouped[row.table_name] = [];
        grouped[row.table_name].push({ column_name: row.column_name, data_type: row.data_type });
      }
      customTables = "\n\n## Custom Tables (created dynamically)\n" +
        Object.entries(grouped).map(([table, cols]) =>
          `### ${table}\n${cols.map((c) => `- ${c.column_name}: ${c.data_type}`).join("\n")}`
        ).join("\n\n");
    }
  } catch {
    // Ignore — custom tables query may fail
  }

  return `## Database Schema (Prisma)

\`\`\`prisma
${schema}
\`\`\`

## Table Statistics
${Object.entries(counts).map(([name, count]) => `- ${name}: ${count >= 0 ? count : "error"} rows`).join("\n")}${customTables}`;
}
