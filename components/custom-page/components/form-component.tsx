"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentConfig } from "../page-renderer";

type FormField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea" | "date" | "boolean";
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

export function FormComponent({ config }: { config: ComponentConfig }) {
  const { table, fields } = config.props as {
    table: string;
    fields: FormField[];
  };

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const isCstmTable = table.startsWith("cstm_") || table.startsWith("custom_");

  function updateField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit() {
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      if (isCstmTable) {
        // Direct insert for custom tables — fast, no AI round-trip
        const res = await fetch("/api/cstm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, data: values }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to save");
        }
      } else {
        // Prisma models: use agent chat
        const res = await fetch("/api/ui-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Create a new record in ${table} with this data: ${JSON.stringify(values)}`,
            context: "ui-agent",
          }),
        });

        if (!res.ok) throw new Error("Failed to save");
      }

      setValues({});
      setSuccess(true);
      // Dispatch event so sibling data-table components can refetch
      window.dispatchEvent(new CustomEvent("cstm-data-changed", { detail: { table } }));
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save record");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {config.title && (
        <div className="px-4 py-3 border-b border-border bg-card">
          <h3 className="text-sm font-semibold">{config.title}</h3>
        </div>
      )}
      <div className="p-4 space-y-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            {field.type === "textarea" ? (
              <textarea
                value={(values[field.key] as string) || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
              />
            ) : field.type === "select" && field.options ? (
              <select
                value={(values[field.key] as string) || ""}
                onChange={(e) => updateField(field.key, e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select...</option>
                {field.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : field.type === "boolean" ? (
              <button
                onClick={() => updateField(field.key, !values[field.key])}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer",
                  values[field.key] ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    values[field.key] ? "translate-x-4.5" : "translate-x-0.5"
                  )}
                />
              </button>
            ) : (
              <Input
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                value={(values[field.key] as string) || ""}
                onChange={(e) =>
                  updateField(
                    field.key,
                    field.type === "number" ? Number(e.target.value) : e.target.value
                  )
                }
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : success ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {success ? "Saved!" : "Save"}
        </Button>
      </div>
    </div>
  );
}
