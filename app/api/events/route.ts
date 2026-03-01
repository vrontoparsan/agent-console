import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateActions } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, summary, rawContent, source, type, priority, categoryId } = body;

  if (!title || !type) {
    return NextResponse.json({ error: "title and type required" }, { status: 400 });
  }

  const event = await prisma.event.create({
    data: {
      title,
      summary: summary || null,
      rawContent: rawContent || null,
      source: source || "manual",
      type,
      priority: priority || 0,
      categoryId: categoryId || null,
    },
    include: { category: true },
  });

  // Generate AI actions in background
  if (rawContent || summary) {
    const categoryContext = event.category?.contextMd || undefined;
    try {
      const actions = await generateActions(
        title,
        rawContent || summary || "",
        categoryContext
      );
      if (Array.isArray(actions)) {
        await prisma.eventAction.createMany({
          data: actions.map(
            (a: { title: string; description?: string }) => ({
              eventId: event.id,
              title: a.title,
              description: a.description || null,
              aiSuggested: true,
            })
          ),
        });
      }
    } catch {
      // AI actions are best-effort
    }
  }

  return NextResponse.json(event, { status: 201 });
}
