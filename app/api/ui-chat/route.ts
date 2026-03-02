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
import { UI_AGENT_SYSTEM_PROMPT, PAGE_EDITOR_CONTEXT } from "@/lib/instance/configurator-prompt";
import { activeTasks } from "@/lib/agent-tasks";

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

  // Staleness detection: if last assistant message is stuck processing
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    const meta = last.metadata as Record<string, unknown> | null;
    if (last.role === "assistant" && meta?.processing === true) {
      const startedAt = meta.processingStartedAt
        ? new Date(meta.processingStartedAt as string).getTime()
        : 0;
      const isStale = Date.now() - startedAt > 150_000; // 2.5 minutes
      const isStillRunning = activeTasks.has(last.id);

      if (isStale && !isStillRunning) {
        // Auto-resolve stale message
        const updatedMeta = { ...meta, processing: false, error: true, timedOut: true };
        await prisma.message.update({
          where: { id: last.id },
          data: { metadata: updatedMeta },
        });
        last.metadata = updatedMeta;
      }
    }
  }

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
    images,
  } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const userRole = session.user.role;
  const isUIAgent = context === "ui-agent";
  const isPageEditor = context === "page-editor";
  const isUIMode = isUIAgent || isPageEditor;

  if (isUIAgent && !["SUPERADMIN", "ADMIN"].includes(userRole)) {
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

    // Attach images to the last user message if present
    if (images && images.length > 0 && chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.role === "user") {
        lastMsg.content = [
          { type: "text" as const, text: lastMsg.content as string },
          ...images.map((img: { base64: string; mediaType: string }) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data: img.base64,
            },
          })),
        ];
      }
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
      modePrompt = UI_AGENT_SYSTEM_PROMPT;
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

    // 3. Create assistant placeholder for background processing
    const assistantMsg = await prisma.message.create({
      data: {
        content: "",
        role: "assistant",
        customPageId: customPageId || null,
        threadId: !customPageId ? (threadId || null) : null,
        metadata: {
          processing: true,
          processingStartedAt: new Date().toISOString(),
        },
      },
    });

    // Track tool events and page creation
    const toolEvents: string[] = [];
    let createdPage: { id: string; slug: string; title: string } | null = null;
    let streamClosed = false;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        function safeEnqueue(data: string) {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            streamClosed = true;
          }
        }

        // Send message ID so client can poll for this specific message
        safeEnqueue(`messageId:${assistantMsg.id}\n`);

        // Register active task
        activeTasks.set(assistantMsg.id, { startedAt: Date.now() });

        // Fire-and-forget: processing continues even if stream closes
        (async () => {
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
                } else if (["create_instance_page", "update_instance_page_code", "get_instance_page", "verify_instance_code", "introspect_table", "list_instance_pages_code"].includes(name)) {
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
                safeEnqueue(`event:${JSON.stringify(event)}\n`);
              },
              onText: (delta) => {
                safeEnqueue(`text:${JSON.stringify(delta)}\n`);
              },
              onLoopComplete: async (currentText) => {
                // Intermediate save: update message with progress
                const startedAt = (assistantMsg.metadata as Record<string, string>)?.processingStartedAt || new Date().toISOString();
                await prisma.message.update({
                  where: { id: assistantMsg.id },
                  data: {
                    content: currentText,
                    metadata: {
                      processing: true,
                      processingStartedAt: startedAt,
                      toolEvents: toolEvents.length > 0 ? [...toolEvents] : undefined,
                    },
                  },
                });
              },
            });

            // Final save: mark processing complete
            await prisma.message.update({
              where: { id: assistantMsg.id },
              data: {
                content: result,
                metadata: {
                  processing: false,
                  toolEvents: toolEvents.length > 0 ? [...toolEvents] : undefined,
                },
              },
            });

            // Notify client about page creation
            if (createdPage) {
              safeEnqueue(`pageCreated:${JSON.stringify(createdPage)}\n`);
            }

            safeEnqueue(`result:${result}\n`);
            if (!streamClosed) {
              try { controller.close(); } catch { /* already closed */ }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            // Save error to DB
            await prisma.message.update({
              where: { id: assistantMsg.id },
              data: {
                content: `Error: ${errorMsg}`,
                metadata: { processing: false, error: true },
              },
            });
            safeEnqueue(`error:${errorMsg}\n`);
            if (!streamClosed) {
              try { controller.close(); } catch { /* already closed */ }
            }
          } finally {
            activeTasks.delete(assistantMsg.id);
          }
        })(); // NOT awaited — fire and forget
      },
      cancel() {
        // Client disconnected — processing continues in background
        streamClosed = true;
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
