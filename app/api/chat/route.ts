import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamChat, agenticChat } from "@/lib/claude";
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

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = req.nextUrl.searchParams.get("eventId");

  const messages = await prisma.message.findMany({
    where: { eventId: eventId || null },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json({ messages });
}

async function buildSystemPrompt(eventId: string | null): Promise<string> {
  let systemPrompt = "You are a helpful business assistant in Agent Console.";

  // Load permanent contexts
  const contexts = await prisma.agentContext.findMany({
    where: { enabled: true, type: "PERMANENT" },
    orderBy: { order: "asc" },
  });
  if (contexts.length > 0) {
    systemPrompt += "\n\n" + contexts.map((c) => c.content).join("\n\n");
  }

  // Load event context if event chat
  if (eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { category: true },
    });
    if (event) {
      systemPrompt += `\n\nYou are discussing event: "${event.title}"`;
      if (event.summary) systemPrompt += `\nSummary: ${event.summary}`;
      if (event.rawContent) systemPrompt += `\nOriginal content:\n${event.rawContent}`;
      if (event.category?.contextMd) systemPrompt += `\n\nCategory context:\n${event.category.contextMd}`;
    }
  }

  // Load company info
  const company = await prisma.companyInfo.findUnique({ where: { id: "default" } });
  if (company && company.name) {
    systemPrompt += `\n\nCompany: ${company.name}`;
    if (company.ico) systemPrompt += `, ICO: ${company.ico}`;
    if (company.dic) systemPrompt += `, DIC: ${company.dic}`;
  }

  return systemPrompt;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { message, eventId, images } = body;

  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const userRole = session.user.role;

  // Save user message
  await prisma.message.create({
    data: {
      content: message,
      role: "user",
      eventId: eventId || null,
      userId: session.user.id,
    },
  });

  const basePrompt = await buildSystemPrompt(eventId);

  // Get chat history
  const history = await prisma.message.findMany({
    where: { eventId: eventId || null },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  // Build chat messages, appending images to the last user message if present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatMessages: any[] = history.map((m, idx) => {
    const isLast = idx === history.length - 1;
    if (isLast && m.role === "user" && images && images.length > 0) {
      // Multi-content message with text + images
      const content = [
        { type: "text" as const, text: m.content },
        ...images.map((img: { base64: string; mediaType: string }) => ({
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: img.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: img.base64,
          },
        })),
      ];
      return { role: m.role, content };
    }
    return { role: m.role, content: m.content };
  });

  // SUPERADMIN gets agentic mode with full tools
  if (userRole === "SUPERADMIN") {
    try {
      const schemaContext = await getSchemaContext();
      const tools = [...getDbTools(), ...getPageTools(), ...getSqlTools()];

      const systemPrompt = `${basePrompt}

You are also an agent that can work with the database and create custom UI pages/sections.

${schemaContext}

User role: SUPERADMIN. Full access to all operations.

When the user asks to create a new section (e.g. "Orders overview", "Vacations"):
1. Create the custom database table with execute_sql (prefix with "custom_", include id TEXT PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())
2. Create a custom page with appropriate components (data-table, form, stats) pointing to the new table
3. Publish the page so it appears in the sidebar
4. Explain what was created

Available page component types:
- "data-table": Sortable, filterable, paginated table. Props: table (DB table name), columns (array of {key, label, sortable?}), filters, pageSize, actions
- "form": Input form. Props: table, fields (array of {key, label, type, options?, required?})
- "stats": KPI cards. Props: items (array of {label, table, where?, type: "count"})
- "text": Static markdown. Props: content

## File Attachments
If the user sends files (documents, spreadsheets, images), their contents are included in the message.
You can analyze images visually and parse document contents.
When asked to import file data into the database, carefully analyze the data structure and map it to existing or new tables.

## CRITICAL: Cautious Behavior
You MUST follow these rules strictly:
1. **Always confirm understanding** — Before executing any action, repeat back what you understood the user wants
2. **Always ask for confirmation** — Before ANY database change (create, update, delete, import), explicitly ask "Should I proceed?"
3. **Never assume** — If the request is ambiguous, ask clarifying questions
4. **Show preview** — When importing data, show a sample of what will be inserted before doing it
5. **Step by step** — For complex operations (creating sections, importing data), work step by step and confirm each step

Important:
- Use pagination for queries (limit 20 default)
- Respond in the user's language`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await agenticChat({
              messages: chatMessages,
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

            // Save assistant message
            await prisma.message.create({
              data: { content: result, role: "assistant", eventId: eventId || null },
            });

            controller.enqueue(encoder.encode(`result:${result}\n`));
            controller.close();
          } catch (err) {
            controller.enqueue(encoder.encode(`error:${err instanceof Error ? err.message : "Unknown error"}\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
      });
    } catch (error) {
      console.error("Agentic chat error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ error: "Chat failed", detail: msg }, { status: 500 });
    }
  }

  // Non-SUPERADMIN: regular streaming chat
  try {
    const stream = await streamChat(chatMessages, basePrompt);
    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              const text = event.delta.text;
              fullResponse += text;
              controller.enqueue(new TextEncoder().encode(text));
            }
          }

          await prisma.message.create({
            data: { content: fullResponse, role: "assistant", eventId: eventId || null },
          });

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Chat failed", detail: msg }, { status: 500 });
  }
}
