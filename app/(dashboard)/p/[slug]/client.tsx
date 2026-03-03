"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageRenderer, type PageConfig } from "@/components/custom-page/page-renderer";
import dynamic from "next/dynamic";

const InstancePageRenderer = dynamic(
  () => import("@/lib/instance/sandbox").then((m) => m.InstancePageRenderer),
  { ssr: false }
);
import { AgentChat } from "@/components/custom-page/agent-chat";
import { Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function CustomPageClient({
  slug,
  pageId,
  title,
  config,
  code,
  userRole,
}: {
  slug: string;
  pageId: string;
  title: string;
  config: Record<string, unknown>;
  code?: string | null;
  userRole?: string;
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);
  const [errorToReport, setErrorToReport] = useState<string | null>(null);
  const canUseAgent = userRole === "SUPERADMIN";

  // Listen for instance SDK events
  useEffect(() => {
    function handleNotify(e: Event) {
      const detail = (e as CustomEvent).detail;
      setNotification({ message: detail.message, type: detail.type || "info" });
      setTimeout(() => setNotification(null), 4000);
    }
    function handleNavigate(e: Event) {
      const { path } = (e as CustomEvent).detail;
      router.push(path);
    }
    function handleErrorReport(e: Event) {
      if (!canUseAgent) return;
      const { error } = (e as CustomEvent).detail;
      setErrorToReport(error);
      setChatOpen(true);
    }
    window.addEventListener("instance-notify", handleNotify);
    window.addEventListener("instance-navigate", handleNavigate);
    window.addEventListener("instance-error-report", handleErrorReport);
    return () => {
      window.removeEventListener("instance-notify", handleNotify);
      window.removeEventListener("instance-navigate", handleNavigate);
      window.removeEventListener("instance-error-report", handleErrorReport);
    };
  }, [router, canUseAgent]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Page header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {canUseAgent && (
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              chatOpen
                ? "bg-muted text-muted-foreground hover:bg-accent"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {chatOpen ? <X className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
            <span className="hidden sm:inline">UI Agent</span>
          </button>
        )}
      </div>

      {/* Content + right panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Page content */}
        <div className="flex-1 overflow-auto p-6">
          {code ? (
            <InstancePageRenderer code={code} />
          ) : (
            <PageRenderer config={config as PageConfig} />
          )}
        </div>

        {/* Desktop: Right panel */}
        {chatOpen && canUseAgent && (
          <div className="hidden md:flex w-[400px] border-l border-border flex-col shrink-0 overflow-hidden">
            <AgentChat
              context="page-editor"
              pageSlug={slug}
              customPageId={pageId}
              onPageUpdated={() => router.refresh()}
              initialMessage={errorToReport ? `Runtime Error na tejto stránke:\n\n${errorToReport}\n\nPrečítaj aktuálny kód stránky (get_instance_page) a oprav túto chybu.` : undefined}
              onInitialMessageSent={() => setErrorToReport(null)}
              className="flex-1"
            />
          </div>
        )}
      </div>

      {/* Mobile: Full-screen overlay */}
      {chatOpen && canUseAgent && (
        <div className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">UI Agent</span>
            </div>
            <button
              onClick={() => setChatOpen(false)}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <AgentChat
            context="page-editor"
            pageSlug={slug}
            customPageId={pageId}
            onPageUpdated={() => router.refresh()}
            initialMessage={errorToReport ? `Runtime Error na tejto stránke:\n\n${errorToReport}\n\nPrečítaj aktuálny kód stránky (get_instance_page) a oprav túto chybu.` : undefined}
            onInitialMessageSent={() => setErrorToReport(null)}
            className="flex-1"
          />
        </div>
      )}

      {/* Toast notification */}
      {notification && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2",
            notification.type === "error" && "bg-destructive text-destructive-foreground",
            notification.type === "success" && "bg-green-600 text-white",
            notification.type === "info" && "bg-primary text-primary-foreground"
          )}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
}
