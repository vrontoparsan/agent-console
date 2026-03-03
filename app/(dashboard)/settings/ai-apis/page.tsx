"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Save,
  Loader2,
  Key,
  Shield,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type KeySlot = {
  label: string;
  token: string;
  hasToken: boolean;
};

const SLOT_LABELS = ["Primárny", "Záložný 1", "Záložný 2"];

export default function AiApisPage() {
  const [keys, setKeys] = useState<KeySlot[]>(
    SLOT_LABELS.map((l) => ({ label: l, token: "", hasToken: false }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/ai-apis")
      .then((r) => {
        if (r.status === 403) throw new Error("Prístup zamietnutý");
        return r.json();
      })
      .then((data) => {
        if (data.keys && data.keys.length > 0) {
          const merged = SLOT_LABELS.map((defaultLabel, i) => ({
            label: data.keys[i]?.label || defaultLabel,
            token: data.keys[i]?.token || "",
            hasToken: data.keys[i]?.hasToken || false,
          }));
          setKeys(merged);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/settings/ai-apis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: keys.map((k) => ({ label: k.label, token: k.token })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Chyba pri ukladaní");
      }
      setSaved(true);
      // Reload to get masked tokens
      const reloadRes = await fetch("/api/settings/ai-apis");
      const reloadData = await reloadRes.json();
      if (reloadData.keys) {
        const merged = SLOT_LABELS.map((defaultLabel, i) => ({
          label: reloadData.keys[i]?.label || defaultLabel,
          token: reloadData.keys[i]?.token || "",
          hasToken: reloadData.keys[i]?.hasToken || false,
        }));
        setKeys(merged);
      }
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setSaving(false);
    }
  };

  const updateKey = (index: number, field: "label" | "token", value: string) => {
    setKeys((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto max-w-2xl mx-auto py-8 px-6 w-full">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">AI APIs</h1>
      </div>

      <div className="rounded-xl border border-border p-4 mb-4 bg-muted/30">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Failover systém</p>
            <p>
              Primárny kľúč sa používa vždy. Ak zlyhá (401/403), automaticky sa prepne na záložný.
              Podporované sú API kľúče (<code className="text-xs bg-muted px-1 rounded">sk-ant-...</code>) aj OAuth tokeny.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/50 p-4 mb-4 bg-destructive/5">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {keys.map((key, i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-4 space-y-3",
              i === 0 ? "border-primary/30 bg-primary/5" : "border-border"
            )}
          >
            <div className="flex items-center gap-2">
              <Key className={cn("h-4 w-4", i === 0 ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-medium">
                {SLOT_LABELS[i]}
              </span>
              {key.hasToken && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />
              )}
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Názov (napr. Production, Backup)"
                value={key.label}
                onChange={(e) => updateKey(i, "label", e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder={key.hasToken ? "Token uložený — zadajte nový pre zmenu" : "API kľúč alebo OAuth token"}
                value={key.token}
                onChange={(e) => updateKey(i, "token", e.target.value)}
                type="password"
                className="text-sm font-mono"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Uložiť
        </Button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Uložené!
          </span>
        )}
      </div>
    </div>
  );
}
