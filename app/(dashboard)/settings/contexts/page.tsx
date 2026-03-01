"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Save, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Context = {
  id: string;
  name: string;
  type: "PERMANENT" | "CONDITIONAL";
  content: string;
  enabled: boolean;
  order: number;
};

const tabs = [
  {
    key: "PERMANENT" as const,
    label: "Permanent",
    sublabel: "Always",
    description: "Included in every AI message. Standard OpenClaw contexts: AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md.",
  },
  {
    key: "CONDITIONAL" as const,
    label: "Conditional",
    sublabel: "When needed",
    description: "Loaded only when relevant. OpenClaw contexts: HEARTBEAT.md (cron/scheduled), MEMORY.md (cross-session), BOOTSTRAP.md (onboarding).",
  },
];

export default function ContextsPage() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [editing, setEditing] = useState<Context | null>(null);
  const [activeTab, setActiveTab] = useState<"PERMANENT" | "CONDITIONAL">("PERMANENT");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadContexts();
  }, []);

  async function loadContexts() {
    setLoading(true);
    const res = await fetch("/api/settings/contexts");
    if (res.ok) setContexts(await res.json());
    setLoading(false);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const method = editing.id ? "PUT" : "POST";
    await fetch("/api/settings/contexts", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    loadContexts();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/settings/contexts?id=${id}`, { method: "DELETE" });
    loadContexts();
  }

  async function handleToggle(ctx: Context) {
    await fetch("/api/settings/contexts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ctx, enabled: !ctx.enabled }),
    });
    loadContexts();
  }

  function newContext() {
    setEditing({
      id: "",
      name: "",
      type: activeTab,
      content: "",
      enabled: true,
      order: filteredContexts.length,
    });
  }

  const filteredContexts = contexts.filter((c) => c.type === activeTab);
  const activeTabInfo = tabs.find((t) => t.key === activeTab)!;

  if (editing) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">
            {editing.id ? "Edit Context" : "New Context"}
          </h1>
          <Badge variant="secondary" className="ml-2">
            {editing.type === "PERMANENT" ? "In each message" : "In case"}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Context name"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Content (Markdown)
            </label>
            <textarea
              value={editing.content}
              onChange={(e) =>
                setEditing({ ...editing, content: e.target.value })
              }
              rows={14}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder="# Agent Context&#10;&#10;Write markdown instructions..."
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing({ ...editing, enabled: !editing.enabled })}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer",
                editing.enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                  editing.enabled ? "translate-x-4.5" : "translate-x-0.5"
                )}
              />
            </button>
            <span className="text-sm text-muted-foreground">
              {editing.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          <Button onClick={handleSave} disabled={saving || !editing.name} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Agent Contexts</h1>
      </div>

      {/* Subtabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors relative cursor-pointer",
              activeTab === tab.key
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span>{tab.label}</span>
            <span className="text-xs text-muted-foreground/60 ml-1.5">({tab.sublabel})</span>
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-sm text-muted-foreground mb-4">{activeTabInfo.description}</p>

      {/* Add button */}
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={newContext}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredContexts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No {activeTab === "PERMANENT" ? "permanent" : "case"} contexts yet.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredContexts.map((ctx) => (
            <div
              key={ctx.id}
              className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent/30 cursor-pointer transition-colors"
              onClick={() => setEditing(ctx)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(ctx);
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 cursor-pointer",
                  ctx.enabled ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    ctx.enabled ? "translate-x-4.5" : "translate-x-0.5"
                  )}
                />
              </button>
              <div className="flex-1 min-w-0">
                <span className={cn("text-sm font-medium", !ctx.enabled && "text-muted-foreground")}>
                  {ctx.name}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {ctx.content.slice(0, 100)}{ctx.content.length > 100 ? "..." : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(ctx.id);
                }}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
