"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Key, CheckCircle2, Save, Loader2 } from "lucide-react";

type HealthData = {
  lastActivity: string | null;
  messageCount: number;
  snapshotCount: number;
  emailAccountCount: number;
  cronJobCount: number;
  hasAiKeys: boolean;
};

type AiKeySlot = {
  label: string;
  token: string;
  hasToken: boolean;
};

type TenantDetail = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  companyName: string;
  email: string;
  phone: string;
  web: string;
  billingStatus: string;
  billingNote: string;
  createdAt: string;
  users: { id: string; email: string; name: string; role: string; createdAt: string }[];
  _count: { events: number; customPages: number; snapshots: number };
  health: HealthData;
  aiApiKeys: AiKeySlot[];
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const billingColors: Record<string, string> = {
  trial: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  overdue: "bg-red-500/10 text-red-400 border-red-500/20",
  cancelled: "bg-gray-500/10 text-gray-400",
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    plan: "",
    active: true,
    billingStatus: "trial",
    billingNote: "",
  });
  const AI_SLOT_LABELS = ["Primary", "Backup 1", "Backup 2"];
  const [aiKeys, setAiKeys] = useState<AiKeySlot[]>(
    AI_SLOT_LABELS.map((l) => ({ label: l, token: "", hasToken: false }))
  );
  const [savingKeys, setSavingKeys] = useState(false);
  const [keysSaved, setKeysSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/superadmin/tenants/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return;
        setTenant(data);
        setForm({
          companyName: data.companyName || "",
          plan: data.plan || "standard",
          active: data.active ?? true,
          billingStatus: data.billingStatus || "trial",
          billingNote: data.billingNote || "",
        });
        if (data.aiApiKeys) {
          setAiKeys(AI_SLOT_LABELS.map((defaultLabel, i) => ({
            label: data.aiApiKeys[i]?.label || defaultLabel,
            token: data.aiApiKeys[i]?.token || "",
            hasToken: data.aiApiKeys[i]?.hasToken || false,
          })));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/superadmin/tenants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
  }

  async function handleSaveAiKeys() {
    setSavingKeys(true);
    setKeysSaved(false);
    const res = await fetch(`/api/superadmin/tenants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiApiKeys: aiKeys.map((k) => ({ label: k.label, token: k.token })),
      }),
    });
    if (res.ok) {
      setKeysSaved(true);
      // Reload to get masked tokens
      const reloadRes = await fetch(`/api/superadmin/tenants/${id}`);
      const data = await reloadRes.json();
      if (data.aiApiKeys) {
        setAiKeys(AI_SLOT_LABELS.map((defaultLabel, i) => ({
          label: data.aiApiKeys[i]?.label || defaultLabel,
          token: data.aiApiKeys[i]?.token || "",
          hasToken: data.aiApiKeys[i]?.hasToken || false,
        })));
      }
      setTimeout(() => setKeysSaved(false), 3000);
    }
    setSavingKeys(false);
  }

  async function handleDeactivate() {
    if (!confirm("Are you sure you want to deactivate this tenant?")) return;
    await fetch(`/api/superadmin/tenants/${id}`, { method: "DELETE" });
    router.push("/superadmin");
  }

  async function handleImpersonate() {
    setImpersonating(true);
    // Open window synchronously in click handler to avoid popup blocker
    const newWindow = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/superadmin/tenants/${id}`, {
        method: "POST",
      });
      const text = await res.text();
      console.log("Impersonate response:", res.status, text);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Impersonate: not JSON:", text.slice(0, 200));
        if (newWindow) {
          newWindow.document.write(`<pre>Error: ${res.status}\n${text.slice(0, 500)}</pre>`);
        }
        setImpersonating(false);
        return;
      }
      if (data.url && newWindow) {
        newWindow.location.href = data.url;
      } else {
        console.error("Impersonate: no url in response:", data);
        if (newWindow) {
          newWindow.document.write(`<pre>Error: ${JSON.stringify(data, null, 2)}</pre>`);
        }
      }
    } catch (err) {
      console.error("Impersonate fetch error:", err);
      if (newWindow) {
        newWindow.document.write(`<pre>Fetch error: ${err}</pre>`);
      }
    }
    setImpersonating(false);
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!tenant) return <div className="p-8 text-destructive">Tenant not found</div>;

  const health = tenant.health;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{tenant.companyName || tenant.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Slug: {tenant.slug} &middot; Created: {new Date(tenant.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleImpersonate}
            disabled={impersonating}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {impersonating ? "Opening..." : "Open Console"}
          </Button>
          <Badge variant="secondary" className={tenant.active ? "bg-green-500/10 text-green-400" : ""}>
            {tenant.active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-lg border border-border p-4">
          <div className="text-2xl font-bold">{tenant.users.length}</div>
          <div className="text-xs text-muted-foreground">Users</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-2xl font-bold">{tenant._count.events}</div>
          <div className="text-xs text-muted-foreground">Events</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-2xl font-bold">{tenant._count.customPages}</div>
          <div className="text-xs text-muted-foreground">Pages</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-2xl font-bold">{tenant._count.snapshots}</div>
          <div className="text-xs text-muted-foreground">Snapshots</div>
        </div>
      </div>

      {/* Health & Activity */}
      {health && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Health & Activity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Last Activity</span>
                <span className="text-sm font-medium">
                  {health.lastActivity ? timeAgo(health.lastActivity) : "No activity"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Messages</span>
                <span className="text-sm font-medium">{health.messageCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Cron Jobs</span>
                <span className="text-sm font-medium">{health.cronJobCount}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Email Accounts</span>
                <span className="text-sm font-medium">{health.emailAccountCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Snapshots</span>
                <span className="text-sm font-medium">{health.snapshotCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">AI Keys</span>
                <Badge
                  variant="secondary"
                  className={`text-xs ${health.hasAiKeys ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
                >
                  {health.hasAiKeys ? "Configured" : "Not set"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">Company Name</label>
          <Input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Plan</label>
          <select
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="standard">Standard</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      {/* Billing */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold">Billing</h2>
        <div className="space-y-2">
          <label className="text-sm font-medium">Billing Status</label>
          <select
            value={form.billingStatus}
            onChange={(e) => setForm({ ...form, billingStatus: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="trial">Trial</option>
            <option value="active">Active</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Billing Notes</label>
          <textarea
            value={form.billingNote}
            onChange={(e) => setForm({ ...form, billingNote: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            placeholder="Internal billing notes..."
          />
        </div>
      </div>

      {/* AI API Keys */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold">AI API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Manage API keys for this tenant. Primary key is used first, backups are used on failover.
        </p>
        <div className="space-y-3">
          {aiKeys.map((key, i) => (
            <div
              key={i}
              className={`rounded-lg border p-4 space-y-2 ${
                i === 0 ? "border-primary/30 bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <Key className={`h-4 w-4 ${i === 0 ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-medium">{AI_SLOT_LABELS[i]}</span>
                {key.hasToken && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />}
              </div>
              <Input
                placeholder="Label"
                value={key.label}
                onChange={(e) => {
                  const next = [...aiKeys];
                  next[i] = { ...next[i], label: e.target.value };
                  setAiKeys(next);
                }}
                className="text-sm"
              />
              <Input
                placeholder={key.hasToken ? "Token saved — enter new to change" : "API key or OAuth token"}
                value={key.token}
                onChange={(e) => {
                  const next = [...aiKeys];
                  next[i] = { ...next[i], token: e.target.value };
                  setAiKeys(next);
                }}
                type="password"
                className="text-sm font-mono"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSaveAiKeys} disabled={savingKeys} size="sm" className="gap-2">
            {savingKeys ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Keys
          </Button>
          {keysSaved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Saved!
            </span>
          )}
        </div>
      </div>

      {/* Save / Deactivate */}
      <div className="flex gap-3 mb-8">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {tenant.active && (
          <Button variant="outline" className="text-destructive" onClick={handleDeactivate}>
            Deactivate
          </Button>
        )}
      </div>

      {/* Users */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Users</h2>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {tenant.users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">
                    <Badge variant="secondary" className="text-xs">{u.role}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
