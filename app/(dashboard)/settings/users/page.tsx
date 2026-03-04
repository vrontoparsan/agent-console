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
  role: "SUPERADMIN" | "ADMIN" | "MANAGER" | "EMPLOYEE";
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
    EMPLOYEE: "outline",
  };

  if (editing) {
    return (
      <div className="flex-1 overflow-auto">
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
              {(["SUPERADMIN", "ADMIN", "MANAGER", "EMPLOYEE"] as const).map((r) => (
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
          <div className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {editing.role} — permissions
            </p>
            {editing.role === "SUPERADMIN" && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Navigation</p>
                  <p className="text-xs text-muted-foreground">Events, Data, Chat, Settings, all Pages — full access</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Chat & DB</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Query, create, update, delete — unlimited</li>
                    <li>Execute raw SQL on custom tables</li>
                    <li>Upload files and import data</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">UI & Sections</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Create and configure pages via UI Agent</li>
                    <li>Snapshots — create, restore, and download</li>
                  </ul>
                </div>
              </div>
            )}
            {editing.role === "ADMIN" && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Navigation</p>
                  <p className="text-xs text-muted-foreground">Events, Data, Chat, Settings, all Pages — full access</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Settings</p>
                  <p className="text-xs text-muted-foreground">Company, Agent contexts, Event categories, Cron jobs, Users, Email accounts, Sections, Snapshots</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Chat & DB</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Query, create, update, delete — unlimited</li>
                    <li>Upload files and import data</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">UI & Sections</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Create and configure pages via UI Agent</li>
                    <li>Snapshots — view and create (no restore/download)</li>
                  </ul>
                </div>
              </div>
            )}
            {editing.role === "MANAGER" && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Navigation</p>
                  <p className="text-xs text-muted-foreground">Events, Chat, assigned Pages only. No Settings, no Data browser.</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Chat & DB</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Query data — unlimited</li>
                    <li>Create records — unlimited</li>
                    <li>Update — max 3 records at a time</li>
                    <li>Delete — not allowed</li>
                    <li>SQL — not allowed</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Events & Pages</p>
                  <p className="text-xs text-muted-foreground">Restricted to assigned categories, email accounts, and pages (configure below)</p>
                </div>
              </div>
            )}
            {editing.role === "EMPLOYEE" && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Navigation</p>
                  <p className="text-xs text-muted-foreground">Events, Chat, assigned Pages only. No Settings, no Data browser.</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Chat & DB</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>Query data — unlimited</li>
                    <li>Create — max 1 record at a time</li>
                    <li>Update — max 1 record at a time</li>
                    <li>Delete — not allowed</li>
                    <li>SQL — not allowed</li>
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground mb-1">Events & Pages</p>
                  <p className="text-xs text-muted-foreground">Restricted to assigned categories, email accounts, and pages (configure below)</p>
                </div>
              </div>
            )}
          </div>

          {/* Permissions — for MANAGER and EMPLOYEE roles */}
          {(editing.role === "MANAGER" || editing.role === "EMPLOYEE") ? (
            <div className="space-y-4 rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-muted-foreground">
                Event Visibility
              </p>
              <p className="text-xs text-muted-foreground">
                {editing.role} will only see events matching selected categories or email accounts.
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
              {editing.role} sees all events and custom pages — access restrictions apply to MANAGER and EMPLOYEE roles.
            </p>
          )}

          <Button onClick={handleSave} disabled={saving || !editing.name || !editing.email} className="w-full mt-6">
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
    </div>
  );
}
