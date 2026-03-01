import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages";

const anthropic = new Anthropic({
  authToken: process.env.ANTHROPIC_OAUTH_TOKEN,
  defaultHeaders: {
    "anthropic-beta": "oauth-2025-04-20",
  },
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

/**
 * Agentic chat with tool_use loop.
 * Calls Claude with tools, executes tools on each tool_use response,
 * and loops until Claude responds with end_turn.
 * Returns intermediate events via onEvent callback and the final text.
 */
export async function agenticChat({
  messages,
  systemPrompt,
  tools,
  executeTool,
  onEvent,
  maxLoops = 15,
}: {
  messages: MessageParam[];
  systemPrompt: string;
  tools: Tool[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  onEvent?: (event: { type: string; data: string }) => void;
  maxLoops?: number;
}): Promise<string> {
  const history: MessageParam[] = [...messages];
  let finalText = "";

  for (let i = 0; i < maxLoops; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: history,
      tools,
    });

    // Collect text and tool_use blocks
    const textParts: string[] = [];
    const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    if (textParts.length > 0) {
      finalText = textParts.join("");
    }

    // If no tool calls, we're done
    if (response.stop_reason !== "tool_use" || toolCalls.length === 0) {
      break;
    }

    // Add assistant message with all content blocks
    history.push({
      role: "assistant",
      content: response.content as ContentBlock[],
    });

    // Execute each tool and collect results
    const toolResults: { type: "tool_result"; tool_use_id: string; content: string }[] = [];

    for (const call of toolCalls) {
      onEvent?.({ type: "tool", data: `${call.name}: ${JSON.stringify(call.input).slice(0, 200)}` });

      try {
        const result = await executeTool(call.name, call.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: result.slice(0, 8000), // Limit result size
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Add tool results as user message
    history.push({
      role: "user",
      content: toolResults,
    });
  }

  return finalText;
}
