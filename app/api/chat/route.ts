import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { streamChat } from "@/lib/claude";

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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { message, eventId } = body;

  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Save user message
  await prisma.message.create({
    data: {
      content: message,
      role: "user",
      eventId: eventId || null,
      userId: session.user.id,
    },
  });

  // Build context
  let systemPrompt = "You are a helpful business assistant in Agent Console.";

  // Load permanent contexts
  const contexts = await prisma.agentContext.findMany({
    where: { enabled: true, type: "PERMANENT" },
    orderBy: { order: "asc" },
  });
  if (contexts.length > 0) {
    systemPrompt +=
      "\n\n" + contexts.map((c) => c.content).join("\n\n");
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
      if (event.rawContent)
        systemPrompt += `\nOriginal content:\n${event.rawContent}`;
      if (event.category?.contextMd)
        systemPrompt += `\n\nCategory context:\n${event.category.contextMd}`;
    }
  }

  // Load company info
  const company = await prisma.companyInfo.findUnique({
    where: { id: "default" },
  });
  if (company && company.name) {
    systemPrompt += `\n\nCompany: ${company.name}`;
    if (company.ico) systemPrompt += `, ICO: ${company.ico}`;
    if (company.dic) systemPrompt += `, DIC: ${company.dic}`;
  }

  // Get chat history
  const history = await prisma.message.findMany({
    where: { eventId: eventId || null },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stream response
  try {
    const stream = await streamChat(chatMessages, systemPrompt);

    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              fullResponse += text;
              controller.enqueue(new TextEncoder().encode(text));
            }
          }

          // Save assistant message
          await prisma.message.create({
            data: {
              content: fullResponse,
              role: "assistant",
              eventId: eventId || null,
            },
          });

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Chat failed", detail: msg },
      { status: 500 }
    );
  }
}
