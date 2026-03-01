"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";

type CompanyData = {
  name: string;
  ico: string;
  dic: string;
  icDph: string;
  address: string;
  email: string;
  phone: string;
  web: string;
};

const fields: { key: keyof CompanyData; label: string; placeholder: string }[] = [
  { key: "name", label: "Company Name", placeholder: "Acme s.r.o." },
  { key: "ico", label: "ICO", placeholder: "12345678" },
  { key: "dic", label: "DIC", placeholder: "2012345678" },
  { key: "icDph", label: "IC DPH", placeholder: "SK2012345678" },
  { key: "address", label: "Address", placeholder: "Street 1, 811 01 Bratislava" },
  { key: "email", label: "Email", placeholder: "info@company.sk" },
  { key: "phone", label: "Phone", placeholder: "+421 900 000 000" },
  { key: "web", label: "Website", placeholder: "https://company.sk" },
];

export default function CompanySettingsPage() {
  const [data, setData] = useState<CompanyData>({
    name: "", ico: "", dic: "", icDph: "", address: "", email: "", phone: "", web: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((d) => { if (d) setData(d); });
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/settings/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Company Info</h1>
      </div>

      <div className="space-y-4">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              {f.label}
            </label>
            <Input
              value={data[f.key]}
              onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
              placeholder={f.placeholder}
            />
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving} className="w-full mt-6">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            "Saved!"
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
