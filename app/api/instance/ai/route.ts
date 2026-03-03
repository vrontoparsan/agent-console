import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic";

const MAX_CONTEXT_LENGTH = 10000;
const MAX_IMAGES = 3;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB per image

export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  const { prompt, context, images } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  // Truncate context to prevent abuse
  let contextStr = "";
  if (context) {
    contextStr = typeof context === "string" ? context : JSON.stringify(context);
    if (contextStr.length > MAX_CONTEXT_LENGTH) {
      contextStr = contextStr.slice(0, MAX_CONTEXT_LENGTH) + "\n...(truncated)";
    }
  }

  const textMessage = contextStr
    ? `${prompt}\n\nContext data:\n${contextStr}`
    : prompt;

  // Build message content — text only or multi-content with images
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messageContent: any;

  if (Array.isArray(images) && images.length > 0) {
    // Validate images
    const validImages = images.slice(0, MAX_IMAGES).filter(
      (img: unknown) => typeof img === "string" && (img as string).length < MAX_IMAGE_SIZE
    );

    messageContent = [
      { type: "text", text: textMessage },
      ...validImages.map((img: string) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg" as const,
          data: img,
        },
      })),
    ];
  } else {
    messageContent = textMessage;
  }

  try {
    const anthropic = await getAnthropicClient(ctx.tenantId);
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 12288,
      system:
        "You are a helpful business assistant. Analyze data, answer questions, and provide insights concisely. When processing images of documents, extract data accurately and completely. Respond in the user's language.",
      messages: [{ role: "user", content: messageContent }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return NextResponse.json({ response: text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed" },
      { status: 500 }
    );
  }
}
