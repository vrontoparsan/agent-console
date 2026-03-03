import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic";

const MAX_CONTEXT_LENGTH = 10000;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prompt, context } = await req.json();
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

  const userMessage = contextStr
    ? `${prompt}\n\nContext data:\n${contextStr}`
    : prompt;

  try {
    const anthropic = await getAnthropicClient();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system:
        "You are a helpful business assistant. Analyze data, answer questions, and provide insights concisely. Respond in the user's language.",
      messages: [{ role: "user", content: userMessage }],
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
