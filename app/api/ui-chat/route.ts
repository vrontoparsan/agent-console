import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agenticChat } from "@/lib/claude";
import {
  getDbTools,
  getPageTools,
  getSqlTools,
  getInstancePageTools,
  executeDbTool,
  executePageTool,
  executeSqlTool,
  executeInstancePageTool,
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
      tools.push(...getInstancePageTools());
    }
    if (userRole === "SUPERADMIN") {
      tools.push(...getSqlTools());
    }

    // Build permission info
    const permissionInfo = userRole === "MANAGER"
      ? `User role: MANAGER. Can query, create, and update up to 3 records. Cannot delete. Cannot bulk-edit more than 3 records.`
      : `User role: ${userRole}. Full access to all database operations including delete and bulk updates.`;

    // Load permanent contexts from DB
    const permanentContexts = await prisma.agentContext.findMany({
      where: { enabled: true, type: "PERMANENT" },
      orderBy: { order: "asc" },
    });
    const contextBlock = permanentContexts.length > 0
      ? "\n\n## Agent Contexts\n" + permanentContexts.map((c) => `### ${c.name}\n${c.content}`).join("\n\n")
      : "";

    const systemPrompt = `You are a database agent for Agent Console, a business management platform. You work agentically with the database — you can read, create, update, and delete records.

${permissionInfo}

${schemaContext}
${contextBlock}

${isConfigurator ? `## UI Configurator Mode
You are helping the user create and configure custom UI pages.

### Instance Pages (PREFERRED)
Use create_instance_page to create rich, interactive pages with custom React JSX code.
Instance pages use the SDK — they have access to data hooks, AI, and UI components.
ALWAYS prefer Instance pages over JSON config pages for any non-trivial UI.

When the user describes a UI they want:
1. Create the database table with execute_sql if needed (prefix with "cstm_", include id TEXT PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())
2. Create an Instance page with create_instance_page — write JSX code using SDK hooks and components
3. Publish the page so it appears in the sidebar
4. Explain what you created

### Legacy JSON Config Pages
For very simple pages (just a data table or form), you can still use create_page with JSON config:
- "data-table": Sortable, filterable, paginated table
- "form": Input form for creating/editing records
- "stats": KPI metric cards with counts/sums
- "text": Static markdown content block

When creating pages, use clear slugs, descriptive titles, and appropriate Lucide icon names.
After creating or updating a page, inform the user it will appear in the left sidebar menu.` : `## Data Chat Mode
You are helping the user explore and manage their database. Always:
1. Start by understanding what the user needs
2. Use query_data with appropriate filters and limits (never dump entire tables)
3. Format results clearly for the user
4. Confirm before making changes (create/update/delete)
5. For large tables, use count_records first, then paginated queries`}

Important:
- Always use pagination (limit 20 by default) for queries
- Format data in clean tables or lists for readability
- When the user asks to see data, query it — don't make up data`;

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
              if (["create_instance_page", "update_instance_page_code", "get_instance_page"].includes(name)) {
                return executeInstancePageTool(name, input);
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
