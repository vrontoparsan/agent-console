"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Loader2,
  Mail,
  Server,
  Send,
  MessageSquare,
  Clock,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type EmailAccount = {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpTls: boolean;
  enabled: boolean;
  lastPolledAt: string | null;
  lastError: string | null;
};

type EmailSettings = {
  tone: string;
  signature: string;
};

const emptyAccount: Omit<EmailAccount, "id"> & { id: string } = {
  id: "",
  label: "",
  email: "",
  imapHost: "",
  imapPort: 993,
  imapUser: "",
  imapPassword: "",
  imapTls: true,
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPassword: "",
  smtpTls: true,
  enabled: true,
  lastPolledAt: null,
  lastError: null,
};

const defaultEmailSettings: EmailSettings = {
  tone: "Professional but friendly. Match the language of the sender. Be concise and helpful.",
  signature: "S pozdravom,\n{companyName}\n{email}\n{phone}",
};

export default function EmailSettingsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [editing, setEditing] = useState<EmailAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Email tone/signature settings
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(defaultEmailSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
    loadEmailSettings();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    const res = await fetch("/api/settings/email-accounts");
    if (res.ok) setAccounts(await res.json());
    setLoading(false);
  }

  async function loadEmailSettings() {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/settings/company");
      if (res.ok) {
        const data = await res.json();
        const extra = data?.extra || {};
        if (extra.emailSettings) {
          setEmailSettings({
            tone: extra.emailSettings.tone || defaultEmailSettings.tone,
            signature: extra.emailSettings.signature || defaultEmailSettings.signature,
          });
        }
      }
    } catch {
      // use defaults
    }
    setSettingsLoading(false);
  }

  async function handleSaveEmailSettings() {
    setSettingsSaving(true);
    try {
      // First load current extra to not overwrite other fields
      const res = await fetch("/api/settings/company");
      const data = res.ok ? await res.json() : {};
      const currentExtra = data?.extra || {};

      await fetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extra: { ...currentExtra, emailSettings },
        }),
      });
    } catch {
      // ignore
    }
    setSettingsSaving(false);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const method = editing.id ? "PUT" : "POST";
    await fetch("/api/settings/email-accounts", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    loadAccounts();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/settings/email-accounts?id=${id}`, { method: "DELETE" });
    loadAccounts();
  }

  async function handleToggle(account: EmailAccount) {
    await fetch("/api/settings/email-accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...account, enabled: !account.enabled }),
    });
    loadAccounts();
  }

  function updateField<K extends keyof EmailAccount>(key: K, value: EmailAccount[K]) {
    if (!editing) return;
    setEditing({ ...editing, [key]: value });
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
            {editing.id ? "Edit Email Account" : "New Email Account"}
          </h1>
        </div>

        <div className="space-y-6">
          {/* Basic info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Mail className="h-4 w-4" />
              Account
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Label</label>
                <Input
                  value={editing.label}
                  onChange={(e) => updateField("label", e.target.value)}
                  placeholder="e.g. Support Inbox"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Email address</label>
                <Input
                  value={editing.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="support@company.com"
                />
              </div>
            </div>
          </div>

          {/* IMAP */}
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Server className="h-4 w-4" />
              IMAP (Incoming)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Host</label>
                <Input
                  value={editing.imapHost}
                  onChange={(e) => updateField("imapHost", e.target.value)}
                  placeholder="imap.gmail.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Port</label>
                <Input
                  type="number"
                  value={editing.imapPort}
                  onChange={(e) => updateField("imapPort", parseInt(e.target.value) || 993)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Username</label>
                <Input
                  value={editing.imapUser}
                  onChange={(e) => updateField("imapUser", e.target.value)}
                  placeholder="user@gmail.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={editing.imapPassword}
                  onChange={(e) => updateField("imapPassword", e.target.value)}
                  placeholder="App password"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateField("imapTls", !editing.imapTls)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer",
                  editing.imapTls ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    editing.imapTls ? "translate-x-4.5" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className="text-sm text-muted-foreground">TLS</span>
            </div>
          </div>

          {/* SMTP */}
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Send className="h-4 w-4" />
              SMTP (Outgoing) — optional
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Host</label>
                <Input
                  value={editing.smtpHost || ""}
                  onChange={(e) => updateField("smtpHost", e.target.value || null)}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Port</label>
                <Input
                  type="number"
                  value={editing.smtpPort ?? 587}
                  onChange={(e) => updateField("smtpPort", parseInt(e.target.value) || null)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Username</label>
                <Input
                  value={editing.smtpUser || ""}
                  onChange={(e) => updateField("smtpUser", e.target.value || null)}
                  placeholder="Same as IMAP or different"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={editing.smtpPassword || ""}
                  onChange={(e) => updateField("smtpPassword", e.target.value || null)}
                  placeholder="App password"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateField("smtpTls", !editing.smtpTls)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer",
                  editing.smtpTls ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    editing.smtpTls ? "translate-x-4.5" : "translate-x-0.5"
                  )}
                />
              </button>
              <span className="text-sm text-muted-foreground">TLS</span>
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateField("enabled", !editing.enabled)}
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

          <Button
            onClick={handleSave}
            disabled={saving || !editing.label || !editing.email || !editing.imapHost || !editing.imapUser || !editing.imapPassword}
            className="w-full"
          >
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
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Email Accounts</h1>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Configure email accounts to receive events via IMAP polling and send replies via SMTP.
        Enabled accounts are polled every 2 minutes for new emails.
      </p>

      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setEditing({ ...emptyAccount })}>
          <Plus className="h-4 w-4" />
          New Account
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No email accounts configured yet.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent/30 cursor-pointer transition-colors"
              onClick={() => setEditing(acc)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle(acc);
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 cursor-pointer",
                  acc.enabled ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    acc.enabled ? "translate-x-4.5" : "translate-x-0.5"
                  )}
                />
              </button>
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn("text-sm font-medium", !acc.enabled && "text-muted-foreground")}>
                  {acc.label}
                </span>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {acc.email} — {acc.imapHost}:{acc.imapPort}
                  </p>
                  {acc.lastPolledAt && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                      <Clock className="h-3 w-3" />
                      {new Date(acc.lastPolledAt).toLocaleTimeString()}
                    </span>
                  )}
                  {acc.lastError && (
                    <span className="text-xs text-red-400 flex items-center gap-1 shrink-0" title={acc.lastError}>
                      <AlertCircle className="h-3 w-3" />
                      Error
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(acc.id);
                }}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Agent Email Tone & Signature */}
      <div className="mt-10 pt-8 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Agent Email Tone & Signature</h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Configure how the AI agent sounds when replying to emails. These settings apply to all auto-composed email replies.
        </p>

        {settingsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Tone & Style Instructions
              </label>
              <textarea
                value={emailSettings.tone}
                onChange={(e) => setEmailSettings({ ...emailSettings, tone: e.target.value })}
                placeholder="e.g. Professional but friendly. Always respond in Slovak..."
                className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
                rows={4}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Email Signature
              </label>
              <textarea
                value={emailSettings.signature}
                onChange={(e) => setEmailSettings({ ...emailSettings, signature: e.target.value })}
                placeholder="S pozdravom,\n{companyName}"
                className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground font-mono"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variables: {"{companyName}"}, {"{email}"}, {"{phone}"}, {"{web}"}
              </p>
            </div>

            <Button
              onClick={handleSaveEmailSettings}
              disabled={settingsSaving}
              className="w-full"
            >
              {settingsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Email Settings
            </Button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
