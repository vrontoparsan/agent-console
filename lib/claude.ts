import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, failoverToNextKey } from "@/lib/anthropic";

/** Helper: call fn with automatic key failover on auth errors. */
async function withFailover<T>(tenantId: string | undefined, fn: (client: Anthropic) => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const client = await getAnthropicClient(tenantId);
      return await fn(client);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if ((status === 401 || status === 403) && i < maxAttempts - 1 && failoverToNextKey(tenantId)) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("All API keys failed");
}

export async function generateActions(
  eventTitle: string,
  eventContent: string,
  categoryContext?: string,
  tenantId?: string
) {
  const systemPrompt = `You are a business process assistant. Analyze the incoming event and suggest 2-4 concrete actions the user can take to resolve it.
${categoryContext ? `\nContext for this type of event:\n${categoryContext}` : ""}

Respond in JSON format:
[{"title": "Action title", "description": "What this action does and why"}]`;

  const response = await withFailover(tenantId, (client) =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Event: ${eventTitle}\n\nContent:\n${eventContent}`,
        },
      ],
    })
  );

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
 * Classify email as PLUS/MINUS and generate summary.
 * Also attempts to match an existing category.
 */
export async function classifyAndSummarizeEmail(
  subject: string,
  bodyText: string,
  categories: { id: string; name: string; contextMd: string | null }[],
  tenantId?: string
): Promise<{ summary: string; type: "PLUS" | "MINUS"; categoryId: string | null }> {
  const categoryList = categories.length > 0
    ? `\nAvailable categories:\n${categories.map((c) => `- ${c.id}: ${c.name}${c.contextMd ? ` (${c.contextMd.slice(0, 100)})` : ""}`).join("\n")}`
    : "";

  const response = await withFailover(tenantId, (client) =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: `You classify incoming business emails. Respond in JSON only.
${categoryList}

JSON format:
{"summary": "1-2 sentence summary", "type": "PLUS or MINUS", "categoryId": "matching category id or null"}

Rules:
- PLUS = positive (new order, payment, partnership, good news)
- MINUS = negative (complaint, issue, cancellation, problem, request needing attention)
- When uncertain, default to MINUS (needs attention)
- summary should be in the same language as the email`,
      messages: [{ role: "user", content: `Subject: ${subject}\n\nBody:\n${bodyText.slice(0, 3000)}` }],
    })
  );

  const text = response.content[0].type === "text" ? response.content[0].text : "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    return {
      summary: parsed.summary || subject,
      type: parsed.type === "PLUS" ? "PLUS" : "MINUS",
      categoryId: parsed.categoryId || null,
    };
  } catch {
    return { summary: subject, type: "MINUS", categoryId: null };
  }
}

/**
 * Compose an email reply using event context.
 */
export async function composeEmailReply({
  eventTitle,
  eventContent,
  senderName,
  senderEmail,
  chatHistory,
  categoryContext,
  companyInfo,
  toneInstructions,
  signature,
  actionDescription,
  tenantId,
}: {
  eventTitle: string;
  eventContent: string;
  senderName?: string;
  senderEmail?: string;
  chatHistory?: string;
  categoryContext?: string;
  companyInfo?: string;
  toneInstructions?: string;
  signature?: string;
  actionDescription?: string;
  tenantId?: string;
}): Promise<string> {
  const systemPrompt = `You are writing an email reply on behalf of a company.

${toneInstructions ? `Tone & style: ${toneInstructions}` : "Be professional but friendly. Match the language of the original email."}

${companyInfo ? `Company: ${companyInfo}` : ""}
${categoryContext ? `Category context:\n${categoryContext}` : ""}

Rules:
- Write ONLY the email body (no subject line, no "From:", no headers)
- Match the language of the original email
- Be concise and helpful
- Do NOT include a signature — it will be appended automatically
- Address the sender by name if known`;

  const userMsg = `Original email from ${senderName || senderEmail || "sender"}:
Subject: ${eventTitle}

${eventContent}

${chatHistory ? `\nInternal discussion about this event:\n${chatHistory}` : ""}
${actionDescription ? `\nAction to take: ${actionDescription}` : "\nWrite an appropriate reply to this email."}`;

  const response = await withFailover(tenantId, (client) =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    })
  );

  let reply = response.content[0].type === "text" ? response.content[0].text : "";

  if (signature) {
    reply += `\n\n${signature}`;
  }

  return reply;
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
  onText,
  onLoopComplete,
  maxLoops = 25,
  tenantId,
}: {
  messages: MessageParam[];
  systemPrompt: string;
  tools: Tool[];
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  onEvent?: (event: { type: string; data: string }) => void;
  onText?: (delta: string) => void;
  onLoopComplete?: (currentText: string) => Promise<void>;
  maxLoops?: number;
  tenantId?: string;
}): Promise<string> {
  const history: MessageParam[] = [...messages];
  let finalText = "";
  let hadToolCalls = false;

  for (let i = 0; i < maxLoops; i++) {
    // Add separator between iterations (after tool execution)
    if (hadToolCalls) {
      onText?.("\n\n");
    }

    const anthropic = await getAnthropicClient(tenantId);
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 32768,
      system: systemPrompt,
      messages: history,
      tools,
    });

    // Stream text deltas in real-time
    stream.on("text", (delta) => {
      onText?.(delta);
    });

    const response = await stream.finalMessage();

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
      finalText += textParts.join("");
    }

    // If no tool calls and not cut off mid-response, we're done
    if (toolCalls.length === 0 && response.stop_reason !== "max_tokens") {
      break;
    }
    // If hit max_tokens with no tool calls, let Claude continue
    hadToolCalls = false;
    if (toolCalls.length === 0 && response.stop_reason === "max_tokens") {
      history.push({ role: "assistant", content: response.content as ContentBlock[] });
      history.push({ role: "user", content: "Continue where you left off." });
      continue;
    }

    // Add assistant message with all content blocks
    history.push({
      role: "assistant",
      content: response.content as ContentBlock[],
    });

    // Execute each tool and collect results
    hadToolCalls = true;
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

    // Notify caller of loop progress (for intermediate DB saves)
    await onLoopComplete?.(finalText);
  }

  return finalText;
}
