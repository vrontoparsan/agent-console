"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
};

export function AgentChat({
  context,
  pageSlug,
  onPageUpdated,
  className,
}: {
  context: "configurator" | "page-editor";
  pageSlug?: string;
  onPageUpdated?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      // If editing a specific page, prepend context
      const message = pageSlug
        ? `[Editing page: ${pageSlug}] ${text}`
        : text;

      const res = await fetch("/api/ui-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          if (line.startsWith("event:")) {
            const event = JSON.parse(line.slice(6));
            // Show tool execution as a tool message
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-${Date.now()}`,
                role: "tool",
                content: event.data,
              },
            ]);
          } else if (line.startsWith("result:")) {
            assistantText = line.slice(7);
          } else if (line.startsWith("error:")) {
            assistantText = `Error: ${line.slice(6)}`;
          }
        }
      }

      if (assistantText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: assistantText,
          },
        ]);
      }

      // If a page was created/updated, notify parent
      onPageUpdated?.();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            {context === "configurator"
              ? "Describe the UI page you want to create. E.g.: 'Create a Warehouse page with a table of products.'"
              : "Describe changes to this page. E.g.: 'Add a search filter for product name.'"}
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "text-sm",
              msg.role === "user" && "text-right",
              msg.role === "tool" && "text-center"
            )}
          >
            {msg.role === "tool" ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-accent/50 px-2.5 py-1 rounded-full">
                <Wrench className="h-3 w-3" />
                {msg.content.length > 100 ? msg.content.slice(0, 100) + "..." : msg.content}
              </span>
            ) : (
              <div
                className={cn(
                  "inline-block max-w-[85%] px-3 py-2 rounded-xl text-left",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Agent is working...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want..."
            disabled={loading}
            className="flex-1 min-h-[40px] max-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
