"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString("sk-SK");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
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
        <h1 className="text-lg font-semibold tracking-tight">Backup</h1>
      </div>

      {/* Backup config */}
      <div className="space-y-6">
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
          <h2 className="text-sm font-medium text-muted-foreground">
            Backups ({backups.length})
          </h2>
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
    </div>
    </div>
  );
}
