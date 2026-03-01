"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Save, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

type Context = {
  id: string;
  name: string;
  type: "PERMANENT" | "CONDITIONAL";
  content: string;
  enabled: boolean;
  order: number;
};

export default function ContextsPage() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [editing, setEditing] = useState<Context | null>(null);
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

  function newContext() {
    setEditing({
      id: "",
      name: "",
      type: "PERMANENT",
      content: "",
      enabled: true,
      order: contexts.length,
    });
  }

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
            <label className="text-sm font-medium text-muted-foreground">Type</label>
            <div className="flex gap-2">
              {(["PERMANENT", "CONDITIONAL"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEditing({ ...editing, type: t })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    editing.type === t
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t === "PERMANENT" ? "Permanent" : "Conditional"}
                </button>
              ))}
            </div>
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
              rows={12}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder="# Agent Context&#10;&#10;Write markdown instructions..."
            />
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
        <Button size="sm" className="ml-auto" onClick={newContext}>
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : contexts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No contexts yet. Create one to enhance AI responses.
        </p>
      ) : (
        <div className="space-y-2">
          {contexts.map((ctx) => (
            <div
              key={ctx.id}
              className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent/30 cursor-pointer transition-colors"
              onClick={() => setEditing(ctx)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{ctx.name}</span>
                  <Badge
                    variant={ctx.type === "PERMANENT" ? "default" : "secondary"}
                  >
                    {ctx.type === "PERMANENT" ? "Permanent" : "Conditional"}
                  </Badge>
                  {!ctx.enabled && (
                    <Badge variant="outline">Disabled</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {ctx.content.slice(0, 80)}...
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(ctx.id);
                }}
                className="text-muted-foreground hover:text-destructive"
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
