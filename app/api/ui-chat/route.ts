import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agenticChat } from "@/lib/claude";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
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
import { CONFIGURATOR_SYSTEM_PROMPT, PAGE_EDITOR_CONTEXT } from "@/lib/instance/configurator-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── GET: Load thread messages ───────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customPageId = req.nextUrl.searchParams.get("customPageId");
  const threadId = req.nextUrl.searchParams.get("threadId");

  if (!customPageId && !threadId) {
    return NextResponse.json({ messages: [] });
  }

  const messages = await prisma.message.findMany({
    where: customPageId
      ? { customPageId }
      : { threadId },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      content: true,
      role: true,
      metadata: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ messages });
}

// ─── POST: Send message with persistence ─────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    message,
    context,
    customPageId: rawPageId,
    threadId,
    pageSlug,
  } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const userRole = session.user.role;
  const isConfigurator = context === "configurator";
  const isPageEditor = context === "page-editor";
  const isUIMode = isConfigurator || isPageEditor;

  if (isConfigurator && !["SUPERADMIN", "ADMIN"].includes(userRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve customPageId from pageSlug if needed
  let customPageId: string | null = rawPageId || null;
  if (!customPageId && pageSlug) {
    const page = await prisma.customPage.findUnique({
      where: { slug: pageSlug },
      select: { id: true },
    });
    if (page) customPageId = page.id;
  }

  try {
    // 1. Save user message to DB
    const hasThread = customPageId || threadId;
    if (hasThread) {
      await prisma.message.create({
        data: {
          content: message,
          role: "user",
          customPageId: customPageId || null,
          threadId: !customPageId ? (threadId || null) : null,
          userId: session.user.id,
        },
      });
    }

    // 2. Load conversation history from DB
    let chatMessages: MessageParam[] = [];

    if (hasThread) {
      const history = await prisma.message.findMany({
        where: customPageId
          ? { customPageId }
          : { threadId },
        orderBy: { createdAt: "asc" },
        take: 80,
        select: { content: true, role: true },
      });

      // Build alternating user/assistant messages for Claude API
      for (const m of history) {
        if (m.role === "user" || m.role === "assistant") {
          // Ensure alternation: merge consecutive same-role messages
          const last = chatMessages[chatMessages.length - 1];
          if (last && last.role === m.role) {
            last.content = last.content + "\n\n" + m.content;
          } else {
            chatMessages.push({ role: m.role, content: m.content });
          }
        }
      }
    } else {
      // No thread — single message (backwards compatible)
      chatMessages = [{ role: "user", content: message }];
    }

    // Ensure messages start with user and end with user
    if (chatMessages.length > 0 && chatMessages[0].role !== "user") {
      chatMessages.shift();
    }

    const schemaContext = await getSchemaContext();

    // Build tools based on context
    const tools = [...getDbTools()];
    if (isUIMode) {
      tools.push(...getPageTools());
      tools.push(...getInstancePageTools());
    }
    if (userRole === "SUPERADMIN") {
      tools.push(...getSqlTools());
    }

    const permissionInfo = userRole === "MANAGER"
      ? `User role: MANAGER. Can query, create, and update up to 3 records. Cannot delete. Cannot bulk-edit more than 3 records.`
      : `User role: ${userRole}. Full access to all database operations including delete and bulk updates.`;

    const permanentContexts = await prisma.agentContext.findMany({
      where: { enabled: true, type: "PERMANENT" },
      orderBy: { order: "asc" },
    });
    const contextBlock = permanentContexts.length > 0
      ? "\n\n## Agent Contexts\n" + permanentContexts.map((c) => `### ${c.name}\n${c.content}`).join("\n\n")
      : "";

    // Build page context if thread belongs to a page
    let pageContext = "";
    if (customPageId) {
      const page = await prisma.customPage.findUnique({
        where: { id: customPageId },
        select: { title: true, slug: true, published: true, code: true },
      });
      if (page) {
        pageContext = `\n\n## Current Page Context
You are working on the page "${page.title}" (slug: "${page.slug}"). Published: ${page.published}.
${page.code ? `Current instance code:\n\`\`\`tsx\n${page.code}\n\`\`\`` : "No instance code yet (legacy JSON config or new page)."}`;
      }
    }

    let modePrompt: string;
    if (isUIMode) {
      modePrompt = CONFIGURATOR_SYSTEM_PROMPT;
      if (isPageEditor) {
        modePrompt += "\n\n" + PAGE_EDITOR_CONTEXT;
      }
    } else {
      modePrompt = `## Data Chat Mode
You are helping the user explore and manage their database. Always:
1. Start by understanding what the user needs
2. Use query_data with appropriate filters and limits (never dump entire tables)
3. Format results clearly for the user
4. Confirm before making changes (create/update/delete)
5. For large tables, use count_records first, then paginated queries`;
    }

    const systemPrompt = `You are an agent for Agent Console, a business management platform.

${permissionInfo}

${schemaContext}
${contextBlock}
${pageContext}

${modePrompt}

Important:
- Always use pagination (limit 20 by default) for queries
- Format data in clean tables or lists for readability
- When the user asks to see data, query it — don't make up data`;

    // Track tool events and page creation for persistence
    const toolEvents: string[] = [];
    let createdPage: { id: string; slug: string; title: string } | null = null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await agenticChat({
            messages: chatMessages,
            systemPrompt,
            tools,
            executeTool: async (name, input) => {
              let toolResult: string;

              if (["query_data", "count_records", "create_record", "update_records", "delete_records"].includes(name)) {
                toolResult = await executeDbTool(name, input, userRole);
              } else if (["create_page", "update_page", "get_page", "list_pages", "delete_page"].includes(name)) {
                toolResult = await executePageTool(name, input);
              } else if (["create_instance_page", "update_instance_page_code", "get_instance_page"].includes(name)) {
                toolResult = await executeInstancePageTool(name, input);
              } else if (name === "execute_sql") {
                toolResult = await executeSqlTool(input, userRole);
              } else {
                toolResult = `Error: Unknown tool "${name}"`;
              }

              // Detect page creation → link orphan thread
              if ((name === "create_page" || name === "create_instance_page") && threadId && !customPageId) {
                try {
                  const parsed = JSON.parse(toolResult);
                  if (parsed.created?.id) {
                    createdPage = {
                      id: parsed.created.id,
                      slug: parsed.created.slug || (input.slug as string),
                      title: parsed.created.title || (input.title as string),
                    };
                    // Link all orphan thread messages to the new page
                    await prisma.message.updateMany({
                      where: { threadId },
                      data: { customPageId: parsed.created.id, threadId: null },
                    });
                    customPageId = parsed.created.id;
                  }
                } catch { /* ignore parse errors */ }
              }

              return toolResult;
            },
            onEvent: (event) => {
              toolEvents.push(event.data);
              controller.enqueue(encoder.encode(`event:${JSON.stringify(event)}\n`));
            },
            onText: (delta) => {
              controller.enqueue(encoder.encode(`text:${JSON.stringify(delta)}\n`));
            },
          });

          // Save assistant response to DB
          if (hasThread || customPageId) {
            await prisma.message.create({
              data: {
                content: result,
                role: "assistant",
                customPageId: customPageId || null,
                threadId: !customPageId ? (threadId || null) : null,
                metadata: toolEvents.length > 0 ? { toolEvents } : undefined,
              },
            });
          }

          // Notify client about page creation
          if (createdPage) {
            controller.enqueue(encoder.encode(`pageCreated:${JSON.stringify(createdPage)}\n`));
          }

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
