"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewTenantPage() {
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [plan, setPlan] = useState("standard");
  const [brandName, setBrandName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/superadmin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, adminEmail, adminPassword, plan, brandName: brandName || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create tenant");
        setLoading(false);
        return;
      }

      router.push("/superadmin");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold mb-2">Add Tenant</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Create a new company on the platform
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Company Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Admin Email</label>
          <Input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@acme.com"
            required
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Admin Password</label>
          <Input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Plan</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="standard">Standard</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {plan === "enterprise" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Brand Name (shown in sidebar)</label>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Leave empty to use 'Agent Bizi'"
            />
            <p className="text-xs text-muted-foreground">
              Enterprise tenants can have a custom app name displayed in the navigation.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Tenant"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
