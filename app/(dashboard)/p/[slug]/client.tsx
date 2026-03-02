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
  title,
  config,
  code,
}: {
  slug: string;
  title: string;
  config: Record<string, unknown>;
  code?: string | null;
}) {
  const router = useRouter();
  const [chatOpen, setChatOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);

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
    window.addEventListener("instance-notify", handleNotify);
    window.addEventListener("instance-navigate", handleNavigate);
    return () => {
      window.removeEventListener("instance-notify", handleNotify);
      window.removeEventListener("instance-navigate", handleNavigate);
    };
  }, [router]);

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Page header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto p-6">
        {code ? (
          <InstancePageRenderer code={code} />
        ) : (
          <PageRenderer config={config as PageConfig} />
        )}
      </div>

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

      {/* Magic wand button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className={cn(
          "fixed bottom-6 left-6 md:left-62 z-30 h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer",
          chatOpen
            ? "bg-muted text-muted-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground hover:opacity-90"
        )}
      >
        {chatOpen ? <X className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
      </button>

      {/* Bottom chat panel */}
      {chatOpen && (
        <div className="fixed bottom-0 left-0 md:left-56 right-0 z-20 h-[400px] border-t border-border bg-background shadow-2xl">
          <AgentChat
            context="page-editor"
            pageSlug={slug}
            onPageUpdated={() => router.refresh()}
            className="h-full"
          />
        </div>
      )}
    </div>
  );
}
