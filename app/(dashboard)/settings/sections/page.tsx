"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Plus,
  FileText,
  ExternalLink,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Section = {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  published: boolean;
  code: string | null;
};

export default function ManageSectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadSections = useCallback(async () => {
    try {
      const res = await fetch("/api/pages?all=1");
      if (res.ok) {
        const data = await res.json();
        setSections(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSections();
  }, [loadSections]);

  async function handleCreate() {
    if (!newTitle.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setNewTitle("");
        setShowCreate(false);
        await loadSections();
      }
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Naozaj chceš vymazať sekciu "${title}"? Táto akcia je nevratná.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/pages?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await loadSections();
      }
    } catch { /* ignore */ }
    setDeleting(null);
  }

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
          <h1 className="text-lg font-semibold tracking-tight">Spravovať Sekcie</h1>
          <div className="flex-1" />
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Nová Sekcia
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-3">
          {/* Create form */}
          {showCreate && (
            <div className="flex items-center gap-3 rounded-xl border border-border p-4 bg-muted/30">
              <Input
                placeholder="Názov sekcie..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setShowCreate(false); setNewTitle(""); }
                }}
                className="flex-1"
                autoFocus
                disabled={creating}
              />
              <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim() || creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vytvoriť"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewTitle(""); }}>
                Zrušiť
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!loading && sections.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Žiadne sekcie. Vytvor novú sekciu a začni ju budovať.</p>
            </div>
          )}

          {/* Section list */}
          {sections.map((section) => (
            <div
              key={section.id}
              className="flex items-center gap-4 rounded-xl border border-border p-4 hover:bg-accent/30 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{section.title}</p>
                  {section.published ? (
                    <Badge variant="default" className="text-[10px] h-5">Publikovaná</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] h-5">Draft</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">/p/{section.slug}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Link href={`/p/${section.slug}`}>
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Otvoriť
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(section.id, section.title)}
                  disabled={deleting === section.id}
                >
                  {deleting === section.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
