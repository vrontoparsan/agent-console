"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

type Category = {
  id: string;
  name: string;
  description: string | null;
  contextMd: string | null;
  color: string | null;
};

export default function EventConfigPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    setLoading(true);
    const res = await fetch("/api/settings/event-categories");
    if (res.ok) setCategories(await res.json());
    setLoading(false);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const method = editing.id ? "PUT" : "POST";
    await fetch("/api/settings/event-categories", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    loadCategories();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/settings/event-categories?id=${id}`, { method: "DELETE" });
    loadCategories();
  }

  if (editing) {
    return (
      <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">
            {editing.id ? "Edit Category" : "New Category"}
          </h1>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Incoming Order"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Description</label>
            <Input
              value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Brief description of this event type"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Color</label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={editing.color || "#c4a46c"}
                onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                className="w-12 h-9 p-1 cursor-pointer"
              />
              <Input
                value={editing.color || ""}
                onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                placeholder="#c4a46c"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              AI Context (Markdown)
            </label>
            <p className="text-xs text-muted-foreground">
              This context will be used by AI when processing events of this category.
            </p>
            <textarea
              value={editing.contextMd || ""}
              onChange={(e) => setEditing({ ...editing, contextMd: e.target.value })}
              rows={10}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder="# How to handle this event type&#10;&#10;Instructions for the AI..."
            />
          </div>

          <Button onClick={handleSave} disabled={saving || !editing.name} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Event Configurator</h1>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({
          id: "", name: "", description: null, contextMd: null, color: "#c4a46c",
        })}>
          <Plus className="h-4 w-4" /> New Category
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No categories. Create categories to improve AI action suggestions.
        </p>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent/30 cursor-pointer transition-colors"
              onClick={() => setEditing(cat)}
            >
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color || "#c4a46c" }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{cat.name}</p>
                {cat.description && (
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                )}
              </div>
              <Button
                variant="ghost" size="icon"
                onClick={(e) => { e.stopPropagation(); handleDelete(cat.id); }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
