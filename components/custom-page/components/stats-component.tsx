"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import type { ComponentConfig } from "../page-renderer";

type StatItem = {
  label: string;
  table: string;
  where?: Record<string, unknown>;
  type: "count" | "sum";
  field?: string;
};

export function StatsComponent({ config }: { config: ComponentConfig }) {
  const { items } = config.props as { items: StatItem[] };
  const [values, setValues] = useState<(number | null)[]>(items.map(() => null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const results = await Promise.all(
        items.map(async (item) => {
          try {
            const params = new URLSearchParams({ table: item.table, page: "1", pageSize: "1" });
            const res = await fetch(`/api/data?${params}`);
            if (res.ok) {
              const json = await res.json();
              return json.total || 0;
            }
            return 0;
          } catch {
            return 0;
          }
        })
      );
      setValues(results);
      setLoading(false);
    }
    load();
  }, [items]);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {config.title && (
        <div className="px-4 py-3 border-b border-border bg-card">
          <h3 className="text-sm font-semibold">{config.title}</h3>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        {items.map((item, i) => (
          <div key={i} className="bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <p className="text-2xl font-semibold">{values[i]?.toLocaleString() ?? "—"}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
