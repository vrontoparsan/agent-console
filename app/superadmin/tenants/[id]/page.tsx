"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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
  createdAt: string;
  users: { id: string; email: string; name: string; role: string; createdAt: string }[];
  _count: { events: number; customPages: number; snapshots: number };
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ companyName: "", plan: "", active: true });

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
        });
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

  async function handleDeactivate() {
    if (!confirm("Are you sure you want to deactivate this tenant?")) return;
    await fetch(`/api/superadmin/tenants/${id}`, { method: "DELETE" });
    router.push("/superadmin");
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!tenant) return <div className="p-8 text-destructive">Tenant not found</div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{tenant.companyName || tenant.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Slug: {tenant.slug} &middot; Created: {new Date(tenant.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="secondary" className={tenant.active ? "bg-green-500/10 text-green-400" : ""}>
          {tenant.active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
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
      </div>

      {/* Edit Form */}
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
        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
          {tenant.active && (
            <Button variant="outline" className="text-destructive" onClick={handleDeactivate}>
              Deactivate
            </Button>
          )}
        </div>
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
