"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { AgentChat } from "@/components/custom-page/agent-chat";
import { cn } from "@/lib/utils";

type PageInfo = {
  slug: string;
  title: string;
  icon: string | null;
  published: boolean;
  order: number;
};

export default function UIConfiguratorPage() {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPages();
  }, []);

  async function loadPages() {
    setLoading(true);
    const res = await fetch("/api/pages");
    if (res.ok) setPages(await res.json());
    setLoading(false);
  }

  async function handleDelete(slug: string) {
    await fetch("/api/ui-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete the page with slug "${slug}"`,
        context: "configurator",
      }),
    });
    loadPages();
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">UI Configurator</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Create and manage custom UI pages by chatting with the agent. Describe what you need and the agent will build it.
        </p>
      </div>

      {/* Existing pages */}
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Custom Pages</h2>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No custom pages yet. Use the chat below to create one.
          </p>
        ) : (
          <div className="space-y-2">
            {pages.map((page) => (
              <div
                key={page.slug}
                className="flex items-center gap-3 rounded-xl border border-border p-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{page.title}</p>
                  <p className="text-xs text-muted-foreground">/p/{page.slug}</p>
                </div>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    page.published
                      ? "bg-plus/10 text-plus"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {page.published ? "Published" : "Draft"}
                </span>
                <Link href={`/p/${page.slug}`}>
                  <Button variant="ghost" size="icon" className="text-muted-foreground">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(page.slug)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent chat */}
      <AgentChat
        context="configurator"
        onPageUpdated={loadPages}
        className="flex-1 min-h-[400px]"
      />
    </div>
  );
}
