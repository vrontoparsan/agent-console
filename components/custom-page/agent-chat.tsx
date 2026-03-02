"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Wrench, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/markdown";
import { ChatInput, type AttachedFile } from "@/components/chat/chat-input";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: string[];
};

type QueuedMessage = {
  id: string;
  content: string;
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
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Polling ─────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // already polling

    const params = customPageId
      ? `customPageId=${customPageId}`
      : threadId
        ? `threadId=${threadId}`
        : null;
    if (!params) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ui-chat?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.messages?.length) return;

        // Find the last assistant message
        const serverMessages = data.messages as {
          id: string;
          role: string;
          content: string;
          metadata?: Record<string, unknown>;
        }[];
        const lastAssistant = [...serverMessages].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return;

        const isProcessing = lastAssistant.metadata?.processing === true;

        if (!isProcessing) {
          // Task completed — rebuild messages from server, stop polling
          stopPolling();
          const displayMsgs: Message[] = [];
          for (const m of serverMessages) {
            if (m.role === "user" || m.role === "assistant") {
              displayMsgs.push({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                toolEvents:
                  m.role === "assistant" && m.metadata?.toolEvents
                    ? (m.metadata.toolEvents as string[])
                    : undefined,
              });
            }
          }
          setMessages(displayMsgs);
          setLoading(false);
          onPageUpdated?.();
        } else {
          // Still processing — update intermediate content
          setMessages((prev) =>
            prev.map((m) =>
              m.id === lastAssistant.id
                ? {
                    ...m,
                    content: lastAssistant.content || "",
                    toolEvents: lastAssistant.metadata?.toolEvents
                      ? (lastAssistant.metadata.toolEvents as string[])
                      : m.toolEvents,
                  }
                : m
            )
          );
        }
      } catch {
        /* ignore polling errors */
      }
    }, 3000);
  }, [customPageId, threadId, stopPolling, onPageUpdated]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ─── Load thread history ─────────────────────────────────────

  useEffect(() => {
    setMessages([]);
    setHistoryLoaded(false);
    setQueuedMessages([]);
    stopPolling();

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
        let hasProcessing = false;

        for (const m of data.messages) {
          if (m.role === "user" || m.role === "assistant") {
            const isProcessing =
              m.role === "assistant" && m.metadata?.processing === true;
            if (isProcessing) hasProcessing = true;

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

        // If agent is still processing, enter polling mode
        if (hasProcessing) {
          setLoading(true);
          startPolling();
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [customPageId, threadId, stopPolling, startPolling]);

  // ─── Auto-scroll ─────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, queuedMessages, scrollToBottom]);

  useEffect(() => {
    if (historyLoaded) {
      requestAnimationFrame(scrollToBottom);
    }
  }, [historyLoaded, scrollToBottom]);

  // ─── Auto-send queued messages ───────────────────────────────

  const queuedMessagesRef = useRef(queuedMessages);
  queuedMessagesRef.current = queuedMessages;

  // ─── Send handler ────────────────────────────────────────────

  const initialMessageSentRef = useRef(false);

  const handleSend = useCallback(
    async (content: string, attachedFiles?: AttachedFile[]) => {
      const text = content.trim();
      if (!text) return;

      // If agent is working, queue the message
      if (loading) {
        setQueuedMessages((prev) => [
          ...prev,
          { id: `queued-${Date.now()}`, content: text },
        ]);
        return;
      }

      // Build display content for user message
      const fileNames = attachedFiles?.map((f) => f.name) || [];
      const displayContent =
        fileNames.length > 0 ? `${text}\n\n📎 ${fileNames.join(", ")}` : text;

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

      // Track the DB message ID for polling fallback
      let dbMessageId: string | null = null;

      try {
        // Process file attachments
        let fileContext = "";
        const imageAttachments: {
          name: string;
          base64: string;
          mediaType: string;
        }[] = [];

        if (attachedFiles && attachedFiles.length > 0) {
          const docFiles = attachedFiles.filter((f) => f.type === "document");
          const imgFiles = attachedFiles.filter((f) => f.type === "image");

          if (docFiles.length > 0) {
            const formData = new FormData();
            for (const f of docFiles) {
              formData.append("files", f.file);
            }
            const parseRes = await fetch("/api/files/parse", {
              method: "POST",
              body: formData,
            });
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

          for (const img of imgFiles) {
            const buffer = await img.file.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(buffer).reduce(
                (data, byte) => data + String.fromCharCode(byte),
                ""
              )
            );
            imageAttachments.push({
              name: img.name,
              base64,
              mediaType: img.file.type,
            });
          }
        }

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

            if (line.startsWith("messageId:")) {
              // Track the real DB message ID for polling
              dbMessageId = line.slice(10);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, id: dbMessageId! } : m
                )
              );
            } else if (line.startsWith("text:")) {
              try {
                const delta = JSON.parse(line.slice(5));
                assistantText += delta;
                const currentId = dbMessageId || assistantId;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentId ? { ...m, content: assistantText } : m
                  )
                );
              } catch {
                /* skip malformed text delta */
              }
            } else if (line.startsWith("event:")) {
              try {
                const event = JSON.parse(line.slice(6));
                toolEvents.push(event.data);
                const currentId = dbMessageId || assistantId;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentId
                      ? { ...m, toolEvents: [...toolEvents] }
                      : m
                  )
                );
              } catch {
                /* skip malformed events */
              }
            } else if (line.startsWith("result:")) {
              const resultText = line.slice(7);
              if (!assistantText) assistantText = resultText;
              const currentId = dbMessageId || assistantId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === currentId
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
              const currentId = dbMessageId || assistantId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === currentId ? { ...m, content: assistantText } : m
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
            const resultText = buffer.slice(7);
            if (!assistantText) assistantText = resultText;
            const currentId = dbMessageId || assistantId;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentId
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
        setLoading(false);

        // Auto-send first queued message
        const queued = queuedMessagesRef.current;
        if (queued.length > 0) {
          const next = queued[0];
          setQueuedMessages((prev) => prev.slice(1));
          // Small delay to let state settle
          setTimeout(() => handleSend(next.content), 100);
          return; // don't set loading false yet — handleSend will manage it
        }
      } catch {
        // Stream disconnected — if we have a DB message ID, fall back to polling
        if (dbMessageId) {
          startPolling();
          return; // Keep loading=true, polling will handle completion
        }
        // No DB message ID — real error
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.findLastIndex(
            (m) => m.role === "assistant"
          );
          if (lastIdx >= 0) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: "Error: Connection lost. Refresh to check results.",
            };
          }
          return updated;
        });
        setLoading(false);
      }
    },
    [
      loading,
      context,
      customPageId,
      threadId,
      pageSlug,
      onPageUpdated,
      onPageCreated,
      startPolling,
    ]
  );

  // When polling detects completion and queued messages exist, send next
  useEffect(() => {
    if (!loading && historyLoaded && queuedMessages.length > 0) {
      const next = queuedMessages[0];
      setQueuedMessages((prev) => prev.slice(1));
      handleSend(next.content);
    }
  }, [loading, historyLoaded, queuedMessages, handleSend]);

  // ─── Auto-send initialMessage (e.g. from runtime error report) ──

  useEffect(() => {
    if (
      initialMessage &&
      historyLoaded &&
      !loading &&
      !initialMessageSentRef.current
    ) {
      initialMessageSentRef.current = true;
      handleSend(initialMessage);
      onInitialMessageSent?.();
    }
  }, [initialMessage, historyLoaded, loading, handleSend, onInitialMessageSent]);

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3"
      >
        {historyLoaded && messages.length === 0 && queuedMessages.length === 0 && (
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
            className={cn("text-sm", msg.role === "user" && "text-right")}
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
                  <span className="text-xs">Agent pracuje...</span>
                </span>
              ) : msg.role === "assistant" ? (
                <MarkdownContent content={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Queued messages */}
        {queuedMessages.map((qm) => (
          <div key={qm.id} className="text-sm text-right">
            <div className="inline-block max-w-[85%] px-3 py-2 rounded-xl bg-primary/60 text-primary-foreground">
              <p className="whitespace-pre-wrap">{qm.content}</p>
              <span className="flex items-center gap-1 text-xs opacity-70 mt-1 justify-end">
                <Clock className="h-3 w-3" />
                Čaká...
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Status bar when agent is working */}
      {loading && (
        <div className="border-t border-border px-4 py-1.5 bg-muted/30 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-[11px] text-muted-foreground">
            Agent pracuje...
            {queuedMessages.length > 0 &&
              ` (${queuedMessages.length} ${queuedMessages.length === 1 ? "správa čaká" : "správy čakajú"})`}
          </span>
        </div>
      )}

      {/* Input — always enabled so user can queue messages */}
      <ChatInput onSend={handleSend} disabled={false} />
    </div>
  );
}
