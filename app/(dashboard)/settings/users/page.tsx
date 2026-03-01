"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Save, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

type User = {
  id: string;
  email: string;
  name: string;
  role: "SUPERADMIN" | "ADMIN" | "MANAGER";
  categoryIds: string[];
  emailAccountIds: string[];
  pageIds: string[];
};

type EditUser = User & { password?: string };

type Category = { id: string; name: string };
type EmailAccount = { id: string; label: string; email: string };
type CustomPageInfo = { id: string; title: string; slug: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<EditUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [customPages, setCustomPages] = useState<CustomPageInfo[]>([]);

  useEffect(() => { loadUsers(); loadOptions(); }, []);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/settings/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  async function loadOptions() {
    const [catRes, emailRes, pagesRes] = await Promise.all([
      fetch("/api/settings/event-categories"),
      fetch("/api/settings/email-accounts"),
      fetch("/api/data?table=CustomPage&page=1&pageSize=100&search="),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (emailRes.ok) setEmailAccounts(await emailRes.json());
    if (pagesRes.ok) {
      const result = await pagesRes.json();
      setCustomPages((result.data || []).map((p: Record<string, unknown>) => ({ id: p.id, title: p.title, slug: p.slug })));
    }
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    const method = editing.id ? "PUT" : "POST";
    await fetch("/api/settings/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setSaving(false);
    setEditing(null);
    loadUsers();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/settings/users?id=${id}`, { method: "DELETE" });
    loadUsers();
  }

  const roleBadge: Record<string, "default" | "secondary" | "outline"> = {
    SUPERADMIN: "default",
    ADMIN: "secondary",
    MANAGER: "outline",
  };

  if (editing) {
    return (
      <div className="max-w-lg mx-auto py-8 px-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setEditing(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">
            {editing.id ? "Edit User" : "New User"}
          </h1>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Name</label>
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Password {editing.id && "(leave empty to keep current)"}
            </label>
            <Input type="password" value={editing.password || ""} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Role</label>
            <div className="flex gap-2">
              {(["SUPERADMIN", "ADMIN", "MANAGER"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setEditing({ ...editing, role: r })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    editing.role === r ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Role capabilities info */}
          <div className="rounded-xl border border-border p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role permissions</p>
            {editing.role === "SUPERADMIN" && (
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Full access to all features</li>
                <li>Access to Data browser</li>
                <li>Can create new sections and DB tables via Chat (agentic mode)</li>
                <li>Can execute raw SQL on custom tables</li>
                <li>Can delete database records via chat</li>
                <li>Can bulk-edit unlimited records via chat</li>
                <li>Can configure UI pages via UI Configurator</li>
                <li>Sees all custom pages</li>
              </ul>
            )}
            {editing.role === "ADMIN" && (
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Access to all events and settings</li>
                <li>Can delete database records via chat</li>
                <li>Can bulk-edit unlimited records via chat</li>
                <li>Can configure UI pages via UI Configurator</li>
                <li>Sees all custom pages</li>
              </ul>
            )}
            {editing.role === "MANAGER" && (
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Can view and create records via chat</li>
                <li>Can edit up to 3 records at a time via chat</li>
                <li>Cannot delete records</li>
                <li>Cannot bulk-edit more than 3 records</li>
                <li>Event visibility restricted by categories and email accounts below</li>
                <li>Custom page access restricted to assigned pages below</li>
              </ul>
            )}
          </div>

          {/* Permissions — only for MANAGER role */}
          {editing.role === "MANAGER" ? (
            <div className="space-y-4 rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-muted-foreground">
                Event Visibility
              </p>
              <p className="text-xs text-muted-foreground">
                Manager will only see events matching selected categories or email accounts.
              </p>

              {categories.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Categories
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const checked = editing.categoryIds?.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => {
                            const ids = editing.categoryIds || [];
                            setEditing({
                              ...editing,
                              categoryIds: checked
                                ? ids.filter((i) => i !== cat.id)
                                : [...ids, cat.id],
                            });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            checked
                              ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                              : "bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {emailAccounts.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Email Accounts
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {emailAccounts.map((acc) => {
                      const checked = editing.emailAccountIds?.includes(acc.id);
                      return (
                        <button
                          key={acc.id}
                          onClick={() => {
                            const ids = editing.emailAccountIds || [];
                            setEditing({
                              ...editing,
                              emailAccountIds: checked
                                ? ids.filter((i) => i !== acc.id)
                                : [...ids, acc.id],
                            });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            checked
                              ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                              : "bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {acc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {customPages.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Custom Pages
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {customPages.map((page) => {
                      const checked = editing.pageIds?.includes(page.id);
                      return (
                        <button
                          key={page.id}
                          onClick={() => {
                            const ids = editing.pageIds || [];
                            setEditing({
                              ...editing,
                              pageIds: checked
                                ? ids.filter((i) => i !== page.id)
                                : [...ids, page.id],
                            });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                            checked
                              ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                              : "bg-accent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {page.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              {editing.role} sees all events and custom pages — permissions apply to MANAGER role only.
            </p>
          )}

          <Button onClick={handleSave} disabled={saving || !editing.name || !editing.email} className="w-full mt-6">
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
        <Link href="/settings"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-lg font-semibold tracking-tight">Users</h1>
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ id: "", email: "", name: "", role: "MANAGER", password: "", categoryIds: [], emailAccountIds: [], pageIds: [] })}>
          <Plus className="h-4 w-4" /> New User
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 rounded-xl border border-border p-4 hover:bg-accent/30 cursor-pointer transition-colors" onClick={() => setEditing(user)}>
              <div className="flex-1">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Badge variant={roleBadge[user.role]}>{user.role}</Badge>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(user.id); }} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
