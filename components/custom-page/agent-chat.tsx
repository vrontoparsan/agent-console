"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/markdown";
import { ChatInput, type AttachedFile } from "@/components/chat/chat-input";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: string[];
};

export function AgentChat({
  context,
  pageSlug,
  customPageId,
  threadId,
  onPageUpdated,
  onPageCreated,
  initialMessage,
  onInitialMessageSent,
  className,
}: {
  context: "ui-agent" | "page-editor" | "data";
  pageSlug?: string;
  customPageId?: string;
  threadId?: string;
  onPageUpdated?: () => void;
  onPageCreated?: (page: { id: string; slug: string; title: string }) => void;
  initialMessage?: string;
  onInitialMessageSent?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load thread history on mount / thread change
  useEffect(() => {
    setMessages([]);
    setHistoryLoaded(false);

    if (!customPageId && !threadId) {
      setHistoryLoaded(true);
      return;
    }

    const params = customPageId
      ? `customPageId=${customPageId}`
      : `threadId=${threadId}`;

    fetch(`/api/ui-chat?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.messages) return;
        const displayMsgs: Message[] = [];
        for (const m of data.messages) {
          if (m.role === "user" || m.role === "assistant") {
            displayMsgs.push({
              id: m.id,
              role: m.role,
              content: m.content,
              toolEvents:
                m.role === "assistant" && m.metadata?.toolEvents
                  ? (m.metadata.toolEvents as string[])
                  : undefined,
            });
          }
        }
        setMessages(displayMsgs);
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [customPageId, threadId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initialMessageSentRef = useRef(false);

  const handleSend = useCallback(async (content: string, attachedFiles?: AttachedFile[]) => {
    const text = content.trim();
    if (!text || loading) return;

    // Build display content for user message
    const fileNames = attachedFiles?.map((f) => f.name) || [];
    const displayContent = fileNames.length > 0
      ? `${text}\n\n📎 ${fileNames.join(", ")}`
      : text;

    setLoading(true);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: displayContent,
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      // Process file attachments
      let fileContext = "";
      const imageAttachments: { name: string; base64: string; mediaType: string }[] = [];

      if (attachedFiles && attachedFiles.length > 0) {
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

        // Convert images to base64
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
        ? `${text}\n\n[Attached file contents:]${fileContext}`
        : text;

      const res = await fetch("/api/ui-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          context,
          customPageId: customPageId || undefined,
          threadId: threadId || undefined,
          pageSlug: pageSlug || undefined,
          images: imageAttachments.length > 0 ? imageAttachments : undefined,
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let assistantText = "";
      const toolEvents: string[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line) continue;

          if (line.startsWith("text:")) {
            try {
              const delta = JSON.parse(line.slice(5));
              assistantText += delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: assistantText }
                    : m
                )
              );
            } catch {
              /* skip malformed text delta */
            }
          } else if (line.startsWith("event:")) {
            try {
              const event = JSON.parse(line.slice(6));
              toolEvents.push(event.data);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolEvents: [...toolEvents] }
                    : m
                )
              );
            } catch {
              /* skip malformed events */
            }
          } else if (line.startsWith("result:")) {
            assistantText = line.slice(7);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: assistantText,
                      toolEvents:
                        toolEvents.length > 0 ? [...toolEvents] : undefined,
                    }
                  : m
              )
            );
          } else if (line.startsWith("error:")) {
            assistantText = `Error: ${line.slice(6)}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantText }
                  : m
              )
            );
          } else if (line.startsWith("pageCreated:")) {
            try {
              const pageInfo = JSON.parse(line.slice(12));
              onPageCreated?.(pageInfo);
            } catch {
              /* skip */
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer) {
        if (buffer.startsWith("result:")) {
          assistantText = buffer.slice(7);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: assistantText,
                    toolEvents:
                      toolEvents.length > 0 ? [...toolEvents] : undefined,
                  }
                : m
            )
          );
        }
      }

      onPageUpdated?.();
    } catch (err) {
      // Fallback: update last assistant message
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.findLastIndex((m) => m.role === "assistant");
        if (lastIdx >= 0) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    context,
    customPageId,
    threadId,
    pageSlug,
    onPageUpdated,
    onPageCreated,
  ]);

  // Auto-send initialMessage (e.g. from runtime error report)
  useEffect(() => {
    if (initialMessage && historyLoaded && !loading && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      handleSend(initialMessage);
      onInitialMessageSent?.();
    }
  }, [initialMessage, historyLoaded, loading, handleSend, onInitialMessageSent]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {historyLoaded && messages.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            {context === "ui-agent"
              ? "Describe the UI page you want to create. E.g.: 'Create a Warehouse page with a table of products.'"
              : context === "data"
                ? "Ask about your data. E.g.: 'Show me all events from last month.'"
                : "Describe changes to this page. E.g.: 'Add a search filter for product name.'"}
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "text-sm",
              msg.role === "user" && "text-right"
            )}
          >
            {/* Tool event badges (inline on assistant messages) */}
            {msg.role === "assistant" &&
              msg.toolEvents &&
              msg.toolEvents.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {msg.toolEvents.map((evt, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-accent/50 px-2.5 py-1 rounded-full"
                    >
                      <Wrench className="h-3 w-3" />
                      {evt.length > 80 ? evt.slice(0, 80) + "..." : evt}
                    </span>
                  ))}
                </div>
              )}
            <div
              className={cn(
                "inline-block max-w-[85%] px-3 py-2 rounded-xl text-left",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              )}
            >
              {msg.role === "assistant" && !msg.content && loading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Agent is working...</span>
                </span>
              ) : msg.role === "assistant" ? (
                <MarkdownContent content={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Status bar when agent is working */}
      {loading && (
        <div className="border-t border-border px-4 py-1.5 bg-muted/30 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-[11px] text-muted-foreground">Agent pracuje...</span>
        </div>
      )}

      {/* Input with file attachments */}
      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  );
}
