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
};

type EditUser = User & { password?: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<EditUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/settings/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
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
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ id: "", email: "", name: "", role: "MANAGER", password: "" })}>
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
