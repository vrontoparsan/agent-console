"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput, type AttachedFile } from "./chat-input";
import { cn } from "@/lib/utils";
import { MessageSquare, Wrench, Loader2 } from "lucide-react";

type Message = {
  id: string;
  content: string;
  role: "user" | "assistant";
  createdAt: string;
  toolEvents?: string[];
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

  async function handleSend(content: string, attachedFiles?: AttachedFile[]) {
    // Build display content for user message
    const fileNames = attachedFiles?.map((f) => f.name) || [];
    const displayContent = fileNames.length > 0
      ? `${content}\n\n📎 ${fileNames.join(", ")}`
      : content;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      content: displayContent,
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
      // Process file attachments
      let fileContext = "";
      const imageAttachments: { name: string; base64: string; mediaType: string }[] = [];

      if (attachedFiles && attachedFiles.length > 0) {
        // Separate images from documents
        const docFiles = attachedFiles.filter((f) => f.type === "document");
        const imgFiles = attachedFiles.filter((f) => f.type === "image");

        // Parse documents via API
        if (docFiles.length > 0) {
          const formData = new FormData();
          for (const f of docFiles) {
            formData.append("files", f.file);
          }
          const parseRes = await fetch("/api/files/parse", { method: "POST", body: formData });
          if (parseRes.ok) {
            const parseData = await parseRes.json();
            for (const f of parseData.files || []) {
              if (f.content) {
                fileContext += `\n\n--- File: ${f.filename} ---\n${f.content.slice(0, 30000)}`;
              } else if (f.error) {
                fileContext += `\n\n--- File: ${f.filename} (error: ${f.error}) ---`;
              }
            }
          }
        }

        // Convert images to base64 for Claude vision
        for (const img of imgFiles) {
          const buffer = await img.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          imageAttachments.push({
            name: img.name,
            base64,
            mediaType: img.file.type,
          });
        }
      }

      // Build full message with file context
      const fullMessage = fileContext
        ? `${content}\n\n[Attached file contents:]${fileContext}`
        : content;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          eventId: eventId || null,
          images: imageAttachments.length > 0 ? imageAttachments : undefined,
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
      let buffer = "";
      let isAgentic = false;
      const toolEvents: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Detect agentic format on first chunk
        if (!isAgentic && !fullText && (chunk.startsWith("event:") || chunk.startsWith("result:") || chunk.startsWith("text:"))) {
          isAgentic = true;
        }

        if (isAgentic) {
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line) continue;

            if (line.startsWith("text:")) {
              try {
                const delta = JSON.parse(line.slice(5));
                fullText += delta;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullText,
                    toolEvents: toolEvents.length > 0 ? [...toolEvents] : undefined,
                  };
                  return updated;
                });
              } catch { /* skip malformed text delta */ }
            } else if (line.startsWith("event:")) {
              try {
                const evt = JSON.parse(line.slice(6));
                toolEvents.push(evt.data || evt.type);
              } catch { /* skip */ }
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  toolEvents: [...toolEvents],
                };
                return updated;
              });
            } else if (line.startsWith("result:")) {
              fullText = line.slice(7);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: fullText,
                  toolEvents: toolEvents.length > 0 ? [...toolEvents] : undefined,
                };
                return updated;
              });
            } else if (line.startsWith("error:")) {
              fullText = `Error: ${line.slice(6)}`;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText };
                return updated;
              });
            }
          }
        } else {
          // Plain text streaming (non-agentic)
          fullText += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText };
            return updated;
          });
        }
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
            <div key={msg.id}>
              {msg.toolEvents && msg.toolEvents.length > 0 && msg.role === "assistant" && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.toolEvents.map((evt, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-[10px] text-muted-foreground">
                      <Wrench className="h-2.5 w-2.5" />
                      {evt.length > 60 ? evt.slice(0, 60) + "..." : evt}
                    </span>
                  ))}
                </div>
              )}
              <ChatMessage message={msg} />
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={streaming} />
      {streaming && (
        <div className="px-4 py-1.5 bg-muted/30 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-[11px] text-muted-foreground">Agent pracuje...</span>
        </div>
      )}
    </div>
  );
}
