"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

type CronJob = {
  id: string;
  name: string;
  schedule: string;
  action: string;
  enabled: boolean;
};

export default function CronsPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [editing, setEditing] = useState<CronJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCrons(); }, []);

  async function loadCrons() {
    setLoading(true);
    const res = await fetch("/api/settings/crons");
    if (res.ok) setCrons(await res.json());
    setLoading(false);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    await fetch("/api/settings/crons", {
      method: editing.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    loadCrons();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/settings/crons?id=${id}`, { method: "DELETE" });
    loadCrons();
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch("/api/settings/crons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    loadCrons();
  }

  if (editing) {
    return (
      <div className="max-w-lg mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">{editing.id ? "Edit Cron" : "New Cron"}</h1>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Check emails" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Schedule (cron)</label>
            <Input value={editing.schedule} onChange={(e) => setEditing({ ...editing, schedule: e.target.value })} placeholder="*/5 * * * *" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Action</label>
            <textarea value={editing.action} onChange={(e) => setEditing({ ...editing, action: e.target.value })} rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              placeholder="Description of what this cron does..." />
          </div>
          <Button onClick={handleSave} disabled={saving || !editing.name} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-lg font-semibold tracking-tight">Cron Jobs</h1>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ id: "", name: "", schedule: "", action: "", enabled: false })}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : crons.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No cron jobs configured.</p>
      ) : (
        <div className="space-y-2">
          {crons.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => setEditing(c)}>
              <div className="flex-1">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{c.schedule}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleEnabled(c.id, !c.enabled); }}
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${c.enabled ? "bg-plus" : "bg-border"}`}
              >
                <div className={`h-4 w-4 rounded-full bg-white transition-transform ${c.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
