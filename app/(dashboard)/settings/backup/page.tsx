"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Save,
  Loader2,
  Download,
  Trash2,
  Play,
  HardDrive,
  Mail,
  Clock,
  History,
  RotateCcw,
  Plus,
  Circle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────

type BackupConfig = {
  frequency: "manual" | "daily" | "weekly" | "monthly";
  destination: "volume" | "email" | "both";
  email: string;
  emailAccountId: string;
  lastBackup: string | null;
};

type BackupFile = {
  name: string;
  size: number;
  date: string;
};

type EmailAccount = {
  id: string;
  label: string;
  email: string;
};

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

// ─── Helpers ───────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "code only";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("sk-SK");
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
  return formatDate(iso);
}

// ─── Snapshot Section ──────────────────────────────────────

function SnapshotSection() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <History className="h-4 w-4" />
          Snapshots ({total})
        </h2>
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
            <span className="ml-2 text-muted-foreground">{relativeTime(currentSnapshot.createdAt)}</span>
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
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No snapshots yet. The UI Agent will create them automatically when making changes.
        </p>
      ) : (
        <div className="space-y-0">
          {snapshots.map((s, i) => (
            <div key={s.id} className="relative flex gap-3">
              {/* Timeline line */}
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
              <div className="flex-1 pb-3 min-w-0">
                <div className="flex items-start justify-between gap-2 rounded-lg p-2 -ml-1 hover:bg-accent/50 transition-colors group">
                  <div className="min-w-0">
                    <p className={cn("text-sm truncate", s.isCurrent ? "font-medium" : "")}>
                      {s.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {relativeTime(s.createdAt)}
                      {s.customPage && (
                        <span className="ml-1.5 text-primary/70">{s.customPage.title}</span>
                      )}
                      <span className="ml-1.5">{formatSize(s.dataSize)}</span>
                    </p>
                  </div>
                  {!s.isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground"
                      onClick={() => setConfirmRestore(s)}
                      disabled={restoring !== null}
                    >
                      {restoring === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
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

      {/* Restore confirmation dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border p-6 max-w-md mx-4 space-y-4">
            <h3 className="text-sm font-semibold">Restore Snapshot?</h3>
            <div className="space-y-2">
              <p className="text-sm font-medium">&quot;{confirmRestore.label}&quot;</p>
              <p className="text-xs text-muted-foreground">{formatDate(confirmRestore.createdAt)}</p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>This will:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>Save current state as auto-backup</li>
                <li>Restore all page code</li>
                <li>Restore instance database tables</li>
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
  );
}

// ─── Main Page ─────────────────────────────────────────────

export default function BackupPage() {
  const [config, setConfig] = useState<BackupConfig>({
    frequency: "manual",
    destination: "volume",
    email: "",
    emailAccountId: "",
    lastBackup: null,
  });
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backing, setBacking] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [backupRes, emailRes] = await Promise.all([
      fetch("/api/settings/backup"),
      fetch("/api/settings/email-accounts"),
    ]);
    if (backupRes.ok) {
      const data = await backupRes.json();
      setConfig(data.config);
      setBackups(data.backups || []);
    }
    if (emailRes.ok) setEmailAccounts(await emailRes.json());
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/backup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
  }

  async function handleBackupNow() {
    setBacking(true);
    const sendEmail = config.destination === "email" || config.destination === "both";
    const res = await fetch("/api/settings/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendEmail }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.backup) {
        setBackups((prev) => [data.backup, ...prev]);
      }
      setConfig((prev) => ({ ...prev, lastBackup: new Date().toISOString() }));
    }
    setBacking(false);
  }

  async function handleDelete(name: string) {
    await fetch(`/api/settings/backup?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    setBackups((prev) => prev.filter((b) => b.name !== name));
  }

  return (
    <div className="flex-1 overflow-auto">
    <div className="max-w-2xl mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Backup & Snapshots</h1>
      </div>

      <div className="space-y-8">
        {/* ─── Snapshots ─────────────────────────────── */}
        <SnapshotSection />

        {/* ─── Separator ─────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ─── Full Database Backups ─────────────────── */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Full Database Backups
            </h2>

            {/* Last backup info */}
            {config.lastBackup && (
              <div className="rounded-xl border border-border p-4 bg-card/50">
                <p className="text-xs text-muted-foreground">
                  Last backup: <span className="text-foreground font-medium">{formatDate(config.lastBackup)}</span>
                </p>
              </div>
            )}

            {/* Frequency */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Frequency
              </label>
              <div className="flex gap-2">
                {(["manual", "daily", "weekly", "monthly"] as const).map((freq) => (
                  <button
                    key={freq}
                    onClick={() => setConfig({ ...config, frequency: freq })}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer capitalize",
                      config.frequency === freq
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {freq === "manual" ? "Manual" : freq === "daily" ? "Daily" : freq === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            {/* Destination */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                Destination
              </label>
              <div className="flex gap-2">
                {(["volume", "email", "both"] as const).map((dest) => (
                  <button
                    key={dest}
                    onClick={() => setConfig({ ...config, destination: dest })}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                      config.destination === dest
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {dest === "volume" && <><HardDrive className="h-3.5 w-3.5" /> Volume</>}
                    {dest === "email" && <><Mail className="h-3.5 w-3.5" /> Email</>}
                    {dest === "both" && <>Both</>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Volume: stored on Railway persistent storage (/data/backups/).
                {config.destination !== "volume" && " Email: sent as attachment via SMTP."}
              </p>
            </div>

            {/* Email settings (shown when email or both) */}
            {(config.destination === "email" || config.destination === "both") && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Send to email</label>
                  <Input
                    type="email"
                    value={config.email}
                    onChange={(e) => setConfig({ ...config, email: e.target.value })}
                    placeholder="admin@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Send from (SMTP account)</label>
                  <select
                    value={config.emailAccountId}
                    onChange={(e) => setConfig({ ...config, emailAccountId: e.target.value })}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  >
                    <option value="">Select email account...</option>
                    {emailAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.label} ({acc.email})
                      </option>
                    ))}
                  </select>
                  {emailAccounts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No email accounts configured. Add one in Settings &gt; Email.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Save + Backup Now */}
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Settings
              </Button>
              <Button
                onClick={handleBackupNow}
                disabled={backing}
                variant="secondary"
                className="flex-1"
              >
                {backing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Backup Now
              </Button>
            </div>

            {/* Existing backups */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground">
                Backups ({backups.length})
              </h3>
              {backups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No backups yet. Click &quot;Backup Now&quot; to create one.
                </p>
              ) : (
                <div className="space-y-2">
                  {backups.map((b) => (
                    <div
                      key={b.name}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <HardDrive className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(b.size)} &middot; {formatDate(b.date)}
                        </p>
                      </div>
                      <a href={`/api/settings/backup/download?name=${encodeURIComponent(b.name)}`}>
                        <Button variant="ghost" size="icon" className="text-muted-foreground">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(b.name)}
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
        )}
      </div>
    </div>
    </div>
  );
}
