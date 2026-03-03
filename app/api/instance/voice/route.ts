import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAnthropicClient } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Voice-to-text API for Instance pages.
 * Accepts audio via FormData, transcribes with Claude, returns text.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  const prompt = (formData.get("prompt") as string) || "";

  if (!audioFile) {
    return NextResponse.json({ error: "Audio file required" }, { status: 400 });
  }

  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    let mediaType = audioFile.type || "audio/webm";
    if (!mediaType.startsWith("audio/")) {
      mediaType = "audio/webm";
    }

    const systemPrompt = prompt
      ? `Transcribe this voice recording. Then follow the user's instruction about the transcription. Respond in the same language as the recording.`
      : `Transcribe this voice recording faithfully. Return only the transcribed text, nothing else. Respond in the same language as the recording.`;

    const userContent: unknown[] = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      },
    ];

    if (prompt) {
      userContent.push({
        type: "text",
        text: prompt,
      });
    } else {
      userContent.push({
        type: "text",
        text: "Transcribe this voice recording.",
      });
    }

    const anthropic = await getAnthropicClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (anthropic.messages.create as any)({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to transcribe voice", detail: msg },
      { status: 500 }
    );
  }
}
