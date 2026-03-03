import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agenticChat } from "@/lib/claude";
import {
  getDbTools,
  executeDbTool,
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

  // Get chat history (80 messages)
  const history = await prisma.message.findMany({
    where: { eventId: eventId || null },
    orderBy: { createdAt: "asc" },
    take: 80,
  });

  // Build chat messages, appending images to the last user message if present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chatMessages: any[] = history.map((m, idx) => {
    const isLast = idx === history.length - 1;
    if (isLast && m.role === "user" && images && images.length > 0) {
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

  // All roles get agentic mode with DB tools
  try {
    const schemaContext = await getSchemaContext();
    const tools = [...getDbTools()];

    const permissionInfo = userRole === "MANAGER"
      ? `User role: MANAGER. Can query, create, and update up to 3 records. Cannot delete. Cannot bulk-edit more than 3 records.`
      : `User role: ${userRole}. Full access to all database operations including delete and bulk updates.`;

    const systemPrompt = `${basePrompt}

${schemaContext}

${permissionInfo}

## Data Assistant Mode
You help users explore and manage business data. You can:
- Query and filter data across all tables
- Create and update records
- Provide analysis, summaries, and insights
- Help with inventory, orders, products, customers, and any business data

Rules:
- Always use pagination (limit 20 by default) for queries
- Format results in clean tables or lists for readability
- When the user asks to see data, query it — don't make up data
- Confirm before making changes (create/update/delete)
- For large tables, use count_records first, then paginated queries

## File Attachments
If the user sends files (documents, spreadsheets, images), their contents are included in the message.
You can analyze images visually and parse document contents.
When asked to import file data into the database, carefully analyze the data structure and map it to existing or new tables.`;

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
              return `Error: Unknown tool "${name}"`;
            },
            onEvent: (event) => {
              controller.enqueue(encoder.encode(`event:${JSON.stringify(event)}\n`));
            },
            onText: (delta) => {
              controller.enqueue(encoder.encode(`text:${JSON.stringify(delta)}\n`));
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
    console.error("Chat error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Chat failed", detail: msg }, { status: 500 });
  }
}
