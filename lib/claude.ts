import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_OAUTH_TOKEN,
});

export async function streamChat(
  messages: { role: "user" | "assistant"; content: string }[],
  systemPrompt?: string
) {
  return anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt || "You are a helpful business assistant.",
    messages,
  });
}

export async function generateActions(
  eventTitle: string,
  eventContent: string,
  categoryContext?: string
) {
  const systemPrompt = `You are a business process assistant. Analyze the incoming event and suggest 2-4 concrete actions the user can take to resolve it.
${categoryContext ? `\nContext for this type of event:\n${categoryContext}` : ""}

Respond in JSON format:
[{"title": "Action title", "description": "What this action does and why"}]`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Event: ${eventTitle}\n\nContent:\n${eventContent}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}
