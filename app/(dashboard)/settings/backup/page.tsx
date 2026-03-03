"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  History,
  RotateCcw,
  Plus,
  Circle,
  CheckCircle2,
  Database,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type SnapshotItem = {
  id: string;
  label: string;
  parentId: string | null;
  customPageId: string | null;
  dataSize: number;
  isCurrent: boolean;
  createdAt: string;
  customPage: { title: string; slug: string } | null;
};

function formatSize(bytes: number): string {
  if (bytes === 0) return "no data";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleString("sk-SK");
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<SnapshotItem | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/snapshots?pageSize=100");
    if (res.ok) {
      const data = await res.json();
      setSnapshots(data.snapshots || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setCreating(true);
    const res = await fetch("/api/settings/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    if (res.ok) {
      setNewLabel("");
      setShowCreateForm(false);
      await loadSnapshots();
    }
    setCreating(false);
  }

  async function handleRestore(snapshot: SnapshotItem) {
    setRestoring(snapshot.id);
    setConfirmRestore(null);
    try {
      const res = await fetch(`/api/settings/snapshots/${snapshot.id}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        await loadSnapshots();
      } else {
        const data = await res.json();
        alert(`Restore failed: ${data.detail || data.error}`);
      }
    } catch (err) {
      alert(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    setRestoring(null);
  }

  const currentSnapshot = snapshots.find((s) => s.isCurrent);

  return (
    <div className="flex-1 overflow-auto">
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Snapshots</h1>
      </div>

      <div className="space-y-4">
        {/* Header with create button */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {total > 0 ? `${total} snapshot${total !== 1 ? "s" : ""}` : "No snapshots yet"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Snapshot
          </Button>
        </div>

        {/* Current snapshot info */}
        {currentSnapshot && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              Current: <span className="text-foreground font-medium">{currentSnapshot.label}</span>
              <span className="ml-2">{relativeTime(currentSnapshot.createdAt)}</span>
            </p>
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Snapshot description..."
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <Button onClick={handleCreate} disabled={creating || !newLabel.trim()} size="sm">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowCreateForm(false); setNewLabel(""); }}>
              Cancel
            </Button>
          </div>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : snapshots.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <History className="h-8 w-8 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">
              No snapshots yet.
            </p>
            <p className="text-xs text-muted-foreground">
              The UI Agent creates snapshots automatically when making changes, or you can create one manually.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {snapshots.map((s, i) => (
              <div key={s.id} className="relative flex gap-3">
                {/* Timeline line + dot */}
                <div className="flex flex-col items-center">
                  {s.isCurrent ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-3.5" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-3.5" />
                  )}
                  {i < snapshots.length - 1 && (
                    <div className="w-px flex-1 bg-border min-h-[8px]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2 min-w-0">
                  <div className="flex items-center justify-between gap-2 rounded-lg p-2 -ml-1">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm truncate", s.isCurrent ? "font-medium" : "")}>
                        {s.label}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span>{relativeTime(s.createdAt)}</span>
                        {s.customPage && (
                          <span className="text-primary/70">{s.customPage.title}</span>
                        )}
                        {s.dataSize > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Database className="h-3 w-3" />
                            {formatSize(s.dataSize)}
                          </span>
                        )}
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs h-7"
                        onClick={() => setConfirmRestore(s)}
                        disabled={restoring !== null}
                      >
                        {restoring === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore confirmation dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md mx-4 space-y-4">
            <h3 className="text-sm font-semibold">Restore Snapshot?</h3>
            <div className="space-y-2">
              <p className="text-sm font-medium">&quot;{confirmRestore.label}&quot;</p>
              <p className="text-xs text-muted-foreground">
                {new Date(confirmRestore.createdAt).toLocaleString("sk-SK")}
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>This will:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>Save current state as auto-backup first</li>
                <li>Restore all section code and organization</li>
                <li>Restore custom database tables and data</li>
              </ul>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmRestore(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleRestore(confirmRestore)}
                disabled={restoring !== null}
              >
                {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Restore Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
