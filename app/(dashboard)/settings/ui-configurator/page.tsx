"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  Plus,
  MessageSquare,
  ExternalLink,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { AgentChat } from "@/components/custom-page/agent-chat";
import { cn } from "@/lib/utils";

type ThreadInfo = {
  type: "page";
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  published: boolean;
  messageCount: number;
};

type OrphanThread = {
  type: "orphan";
  threadId: string;
  messageCount: number;
  createdAt: string;
};

type ActiveThread =
  | { type: "page"; customPageId: string; title: string; slug: string }
  | { type: "new"; threadId: string };

export default function UIConfiguratorPage() {
  const [threads, setThreads] = useState<ThreadInfo[]>([]);
  const [orphans, setOrphans] = useState<OrphanThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThread, setActiveThread] = useState<ActiveThread | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ui-chat/threads");
      if (res.ok) {
        const data = await res.json();
        setThreads(
          data.pages.map((p: ThreadInfo) => ({ ...p, type: "page" }))
        );
        setOrphans(
          data.orphanThreads.map((o: OrphanThread) => ({ ...o, type: "orphan" }))
        );
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  function handleNewSection() {
    const threadId = crypto.randomUUID();
    setActiveThread({ type: "new", threadId });
  }

  function handleSelectPage(page: ThreadInfo) {
    setActiveThread({
      type: "page",
      customPageId: page.id,
      title: page.title,
      slug: page.slug,
    });
  }

  function handleSelectOrphan(orphan: OrphanThread) {
    setActiveThread({ type: "new", threadId: orphan.threadId });
  }

  function handlePageCreated(page: { id: string; slug: string; title: string }) {
    // Switch from orphan thread to page thread
    setActiveThread({
      type: "page",
      customPageId: page.id,
      title: page.title,
      slug: page.slug,
    });
    loadThreads();
  }

  function handlePageUpdated() {
    loadThreads();
  }

  // Derive key for AgentChat re-mount
  const chatKey = activeThread
    ? activeThread.type === "page"
      ? activeThread.customPageId
      : activeThread.threadId
    : "none";

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">UI Configurator</h1>
        </div>
      </div>

      {/* Main content: thread list + chat */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Thread list sidebar */}
        <div className="w-full md:w-72 lg:w-80 border-b md:border-b-0 md:border-r border-border flex flex-col shrink-0">
          {/* Mobile: compact dropdown-style, Desktop: full sidebar */}
          <div className="p-3 md:p-4 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sections
            </span>
            <Button
              size="sm"
              onClick={handleNewSection}
              className="h-8 text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Section</span>
            </Button>
          </div>

          <div className="flex-1 overflow-auto px-2 md:px-3 pb-3 space-y-1">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {!loading && threads.length === 0 && orphans.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                No sections yet. Create one to get started.
              </p>
            )}

            {/* Page threads */}
            {threads.map((thread) => {
              const isActive =
                activeThread?.type === "page" &&
                activeThread.customPageId === thread.id;
              return (
                <button
                  key={thread.id}
                  onClick={() => handleSelectPage(thread)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-foreground"
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{thread.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      /p/{thread.slug}
                      {!thread.published && " · Draft"}
                    </p>
                  </div>
                  {thread.messageCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      {thread.messageCount}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Orphan threads */}
            {orphans.map((orphan) => {
              const isActive =
                activeThread?.type === "new" &&
                activeThread.threadId === orphan.threadId;
              return (
                <button
                  key={orphan.threadId}
                  onClick={() => handleSelectOrphan(orphan)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-foreground"
                  )}
                >
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">New Section</p>
                    <p className="text-[10px] text-muted-foreground">
                      In progress · {orphan.messageCount} msgs
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeThread ? (
            <>
              {/* Thread header */}
              {activeThread.type === "page" && (
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                  <span className="text-sm font-medium">{activeThread.title}</span>
                  <Link href={`/p/${activeThread.slug}`}>
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground">
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                  </Link>
                </div>
              )}
              <AgentChat
                key={chatKey}
                context="configurator"
                customPageId={
                  activeThread.type === "page" ? activeThread.customPageId : undefined
                }
                threadId={
                  activeThread.type === "new" ? activeThread.threadId : undefined
                }
                onPageUpdated={handlePageUpdated}
                onPageCreated={handlePageCreated}
                className="flex-1"
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-3">
                <MessageSquare className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">
                  Select a section or create a new one to start.
                </p>
                <Button onClick={handleNewSection} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Section
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
