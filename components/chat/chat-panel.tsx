"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
};

export function ChatPanel({
  eventId,
  eventTitle,
}: {
  eventId?: string;
  eventTitle?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEventChat = !!eventId;

  // Load existing messages
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const url = eventId
          ? `/api/chat?eventId=${eventId}`
          : "/api/chat";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [eventId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(content: string) {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      content,
      role: "user",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      content: "",
      role: "assistant",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          eventId: eventId || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.detail || errData?.error || "Chat failed");
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: fullText,
          };
          return updated;
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `Error: ${errorMsg}`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full",
        isEventChat && "event-chat-overlay"
      )}
    >
      {/* Chat header */}
      <div
        className={cn(
          "px-4 py-3 border-b flex items-center gap-2",
          isEventChat
            ? "border-event-chat-border bg-event-chat-bg"
            : "border-border"
        )}
      >
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {isEventChat ? `Chat: ${eventTitle}` : "General Chat"}
        </span>
        {isEventChat && (
          <span className="ml-auto text-[10px] uppercase tracking-widest text-primary/70 font-semibold">
            Event
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">
              {isEventChat
                ? "Start discussing this event"
                : "Ask anything or start a new task"}
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
