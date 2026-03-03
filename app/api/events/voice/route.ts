import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { generateActions } from "@/lib/claude";
import { getAnthropicClient } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return NextResponse.json({ error: "Audio file required" }, { status: 400 });
  }

  try {
    // Convert to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Determine media type
    let mediaType = audioFile.type || "audio/webm";
    // Claude supports: audio/mp3, audio/mp4, audio/mpeg, audio/mpga, audio/m4a,
    // audio/ogg, audio/wav, audio/webm
    if (!mediaType.startsWith("audio/")) {
      mediaType = "audio/webm";
    }

    // Send to Claude for transcription + structuring
    // SDK types don't include audio yet, but the API supports it
    const anthropic = await getAnthropicClient(ctx.tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (anthropic.messages.create as any)({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You transcribe voice recordings and structure them as business events.

Respond in JSON format only:
{
  "title": "Brief event title (max 100 chars)",
  "summary": "1-2 sentence summary of what was said",
  "rawContent": "Full transcript of the voice recording",
  "type": "PLUS or MINUS"
}

Rules:
- PLUS = positive event (good news, new opportunity, achievement)
- MINUS = negative event or something needing attention (problem, complaint, task)
- When uncertain, default to MINUS
- Keep the title concise and descriptive
- rawContent should be the full faithful transcript
- Respond in the same language as the recording`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: "Transcribe this voice recording and structure it as a business event.",
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "{}";

    let parsed: { title?: string; summary?: string; rawContent?: string; type?: string };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      parsed = { title: "Voice Event", summary: text, rawContent: text };
    }

    const title = parsed.title || "Voice Event";
    const eventType = parsed.type === "PLUS" ? "PLUS" : "MINUS";

    // Create event
    const event = await ctx.db.event.create({
      data: {
        title: title.slice(0, 200),
        summary: parsed.summary || null,
        rawContent: parsed.rawContent || null,
        source: "voice",
        type: eventType as "PLUS" | "MINUS",
        priority: 0,
      },
      include: { category: true },
    });

    // Generate AI actions
    try {
      const actions = await generateActions(
        title,
        parsed.rawContent || parsed.summary || "",
        event.category?.contextMd || undefined,
        ctx.tenantId
      );
      if (Array.isArray(actions) && actions.length > 0) {
        await ctx.db.eventAction.createMany({
          data: actions.map((a: { title: string; description?: string }) => ({
            eventId: event.id,
            title: a.title,
            description: a.description || null,
            aiSuggested: true,
          })),
        });
      }
    } catch {
      // AI actions are best-effort
    }

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    console.error("Voice event error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to process voice recording", detail: msg }, { status: 500 });
  }
}
