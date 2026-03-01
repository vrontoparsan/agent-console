"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentConfig } from "../page-renderer";

type Column = {
  key: string;
  label: string;
  sortable?: boolean;
};

type Filter = {
  key: string;
  label: string;
  type: "text" | "select";
  options?: string[];
};

export function DataTableComponent({ config }: { config: ComponentConfig }) {
  const {
    table,
    columns,
    filters,
    pageSize = 20,
  } = config.props as {
    table: string;
    columns: Column[];
    filters?: Filter[];
    pageSize?: number;
  };

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      table,
      page: String(page),
      pageSize: String(pageSize),
    });

    // Build search from filter values
    const searchTerms = Object.values(filterValues).filter(Boolean);
    if (searchTerms.length > 0) {
      params.set("search", searchTerms.join(" "));
    }

    const res = await fetch(`/api/data?${params}`);
    if (res.ok) {
      const json = await res.json();
      let rows = json.data || [];

      // Client-side sort (server doesn't support dynamic sort currently)
      if (sortBy) {
        rows = [...rows].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const va = String(a[sortBy] ?? "");
          const vb = String(b[sortBy] ?? "");
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        });
      }

      setData(rows);
      setTotal(json.total || 0);
    }
    setLoading(false);
  }, [table, page, pageSize, sortBy, sortDir, filterValues]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / (pageSize as number));
  const displayColumns = columns || (data.length > 0 ? Object.keys(data[0]).map((k) => ({ key: k, label: k })) : []);

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
    const s = String(value);
    // Check if it's an ISO date
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      return new Date(s).toLocaleDateString("sk-SK", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return s.length > 80 ? s.slice(0, 80) + "..." : s;
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {config.title && (
        <div className="px-4 py-3 border-b border-border bg-card">
          <h3 className="text-sm font-semibold">{config.title}</h3>
        </div>
      )}

      {/* Filters */}
      {filters && filters.length > 0 && (
        <div className="px-4 py-3 border-b border-border flex gap-3 flex-wrap">
          {filters.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">{f.label}:</label>
              {f.type === "select" && f.options ? (
                <select
                  value={filterValues[f.key] || ""}
                  onChange={(e) => {
                    setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }));
                    setPage(1);
                  }}
                  className="text-xs bg-background border border-input rounded-md px-2 py-1"
                >
                  <option value="">All</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={filterValues[f.key] || ""}
                    onChange={(e) => {
                      setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }));
                      setPage(1);
                    }}
                    className="h-7 text-xs pl-7 w-40"
                    placeholder={`Search ${f.label.toLowerCase()}...`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/50">
              {displayColumns.map((col: Column) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",
                    col.sortable !== false && "cursor-pointer hover:text-foreground"
                  )}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      <ArrowUpDown className={cn("h-3 w-3", sortBy === col.key && "text-primary")} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={displayColumns.length} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length} className="text-center py-8 text-muted-foreground text-sm">
                  No records found
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-accent/30">
                  {displayColumns.map((col: Column) => (
                    <td key={col.key} className="px-4 py-2.5 text-sm">
                      {formatCell(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {total} record{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
