import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { agenticChat } from "@/lib/claude";
import {
  getDbTools,
  getPageTools,
  getSqlTools,
  executeDbTool,
  executePageTool,
  executeSqlTool,
  getSchemaContext,
} from "@/lib/agent-tools/db-tools";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, context } = await req.json();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const userRole = session.user.role;
  const isConfigurator = context === "configurator";

  // Only ADMIN/SUPERADMIN can use the UI Configurator
  if (isConfigurator && !["SUPERADMIN", "ADMIN"].includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const schemaContext = await getSchemaContext();

    // Build tools based on context
    const tools = [...getDbTools()];
    if (isConfigurator || context === "page-editor") {
      tools.push(...getPageTools());
    }
    if (userRole === "SUPERADMIN") {
      tools.push(...getSqlTools());
    }

    // Build permission info
    const permissionInfo = userRole === "MANAGER"
      ? `User role: MANAGER. Can query, create, and update up to 3 records. Cannot delete. Cannot bulk-edit more than 3 records.`
      : `User role: ${userRole}. Full access to all database operations including delete and bulk updates.`;

    const systemPrompt = `You are a database agent for Agent Console, a business management platform. You work agentically with the database — you can read, create, update, and delete records.

${permissionInfo}

${schemaContext}

${isConfigurator ? `## UI Configurator Mode
You are helping the user create and configure custom UI pages. When the user describes a UI they want:
1. Understand what data they need from the database
2. Create/update a custom page with the right components
3. Explain what you created

Available component types for pages:
- "data-table": Sortable, filterable, paginated table
- "form": Input form for creating/editing records
- "stats": KPI metric cards with counts/sums
- "text": Static markdown content block

When creating pages, use clear slugs, descriptive titles, and appropriate Lucide icon names.
After creating or updating a page, inform the user it will appear in the left sidebar menu.

${userRole === "SUPERADMIN" ? `You also have the execute_sql tool to create custom database tables. When the user asks for a new section (e.g. "Orders overview", "Vacations"):
1. Create the custom database table with execute_sql (prefix with "custom_", include id, created_at, updated_at)
2. Create a custom page with appropriate components (data-table, form, stats) pointing to the new table
3. The data-table component can query custom tables — set the "table" prop to the custom table name
4. Publish the page so it appears in the sidebar` : ""}` : `## Data Chat Mode
You are helping the user explore and manage their database. Always:
1. Start by understanding what the user needs
2. Use query_data with appropriate filters and limits (never dump entire tables)
3. Format results clearly for the user
4. Confirm before making changes (create/update/delete)
5. For large tables, use count_records first, then paginated queries`}

## CRITICAL: Cautious Behavior
You MUST follow these rules strictly:
1. **Always confirm understanding** — Before executing any action, repeat back what you understood the user wants
2. **Always ask for confirmation** — Before ANY database change (create, update, delete), explicitly ask "Should I proceed?"
3. **Never assume** — If the request is ambiguous, ask clarifying questions
4. **Show preview** — When making changes, describe what will happen before doing it
5. **Step by step** — For complex operations, work step by step and confirm each step

Important:
- Always use pagination (limit 20 by default) for queries
- Format data in clean tables or lists for readability
- When the user asks to see data, query it — don't make up data
- Respond in the user's language (if they write in Slovak, respond in Slovak)`;

    // Stream events and final response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await agenticChat({
            messages: [{ role: "user", content: message }],
            systemPrompt,
            tools,
            executeTool: async (name, input) => {
              if (["query_data", "count_records", "create_record", "update_records", "delete_records"].includes(name)) {
                return executeDbTool(name, input, userRole);
              }
              if (["create_page", "update_page", "get_page", "list_pages", "delete_page"].includes(name)) {
                return executePageTool(name, input);
              }
              if (name === "execute_sql") {
                return executeSqlTool(input, userRole);
              }
              return `Error: Unknown tool "${name}"`;
            },
            onEvent: (event) => {
              controller.enqueue(encoder.encode(`event:${JSON.stringify(event)}\n`));
            },
          });

          controller.enqueue(encoder.encode(`result:${result}\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`error:${err instanceof Error ? err.message : "Unknown error"}\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 }
    );
  }
}
