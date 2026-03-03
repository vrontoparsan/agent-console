"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Building2 } from "lucide-react";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  active: boolean;
  companyName: string;
  createdAt: string;
  _count: { users: number; events: number; customPages: number };
};

export default function SuperadminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/superadmin/tenants")
      .then((r) => r.json())
      .then((data) => {
        setTenants(data.tenants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage companies on the platform
          </p>
        </div>
        <Link href="/superadmin/tenants/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Tenant
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : tenants.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>No tenants yet</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-center px-4 py-3 font-medium">Users</th>
                <th className="text-center px-4 py-3 font-medium">Events</th>
                <th className="text-center px-4 py-3 font-medium">Pages</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{t.companyName || t.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.slug}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {t.plan}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">{t._count.users}</td>
                  <td className="px-4 py-3 text-center">{t._count.events}</td>
                  <td className="px-4 py-3 text-center">{t._count.customPages}</td>
                  <td className="px-4 py-3">
                    {t.active ? (
                      <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-400 border-green-500/20">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/superadmin/tenants/${t.id}`}
                      className="text-primary hover:underline text-xs"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
