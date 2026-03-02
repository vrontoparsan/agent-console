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
  Pencil,
  Trash2,
  X,
  Check,
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

  const isCstmTable = table.startsWith("cstm_") || table.startsWith("custom_");

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    if (isCstmTable) {
      // Use /api/cstm for server-side sort/filter/search
      const params = new URLSearchParams({
        table,
        page: String(page),
        pageSize: String(pageSize),
      });

      if (sortBy) {
        params.set("sort", sortBy);
        params.set("dir", sortDir);
      }

      if (searchQuery) {
        params.set("search", searchQuery);
      }

      for (const [key, val] of Object.entries(filterValues)) {
        if (val) params.set(`filter_${key}`, val);
      }

      const res = await fetch(`/api/cstm?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data || []);
        setTotal(json.total || 0);
      }
    } else {
      // Use /api/data for Prisma models
      const params = new URLSearchParams({
        table,
        page: String(page),
        pageSize: String(pageSize),
      });

      const searchTerms = Object.values(filterValues).filter(Boolean);
      if (searchTerms.length > 0) {
        params.set("search", searchTerms.join(" "));
      }

      const res = await fetch(`/api/data?${params}`);
      if (res.ok) {
        const json = await res.json();
        let rows = json.data || [];

        // Client-side sort for Prisma models
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
    }
    setLoading(false);
  }, [table, page, pageSize, sortBy, sortDir, filterValues, searchQuery, isCstmTable]);

  useEffect(() => {
    load();
  }, [load]);

  // Listen for data change events from form component
  useEffect(() => {
    function handleDataChanged(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.table === table) {
        load();
      }
    }
    window.addEventListener("cstm-data-changed", handleDataChanged);
    return () => window.removeEventListener("cstm-data-changed", handleDataChanged);
  }, [table, load]);

  const totalPages = Math.ceil(total / (pageSize as number));
  const displayColumns = columns || (data.length > 0
    ? Object.keys(data[0])
        .filter((k) => !["id", "created_at", "updated_at"].includes(k))
        .map((k) => ({ key: k, label: k.replace(/_/g, " ") }))
    : []);

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "\u2014";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value).slice(0, 80);
    const s = String(value);
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

  function startEdit(row: Record<string, unknown>) {
    setEditingId(row.id as string);
    setEditValues({ ...row });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/cstm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id: editingId, data: editValues }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditValues({});
        load();
      }
    } catch {
      // ignore
    }
    setEditSaving(false);
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/cstm?table=${table}&id=${id}`, { method: "DELETE" });
      if (res.ok) {
        load();
      }
    } catch {
      // ignore
    }
    setDeletingId(null);
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
        {config.title && (
          <h3 className="text-sm font-semibold">{config.title}</h3>
        )}
        {isCstmTable && (
          <div className="ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="h-8 text-xs pl-8 w-48"
              placeholder="Search..."
            />
          </div>
        )}
      </div>

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
                    placeholder={`Filter ${f.label.toLowerCase()}...`}
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
              {isCstmTable && (
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={displayColumns.length + (isCstmTable ? 1 : 0)} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length + (isCstmTable ? 1 : 0)} className="text-center py-8 text-muted-foreground text-sm">
                  No records found
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const rowId = row.id as string;
                const isEditing = editingId === rowId;

                return (
                  <tr key={rowId || JSON.stringify(row)} className="border-b border-border/50 hover:bg-accent/30">
                    {displayColumns.map((col: Column) => (
                      <td key={col.key} className="px-4 py-2.5 text-sm">
                        {isEditing && !["id", "created_at", "updated_at"].includes(col.key) ? (
                          <Input
                            value={String(editValues[col.key] ?? "")}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, [col.key]: e.target.value }))}
                            className="h-7 text-xs"
                          />
                        ) : (
                          formatCell(row[col.key])
                        )}
                      </td>
                    ))}
                    {isCstmTable && (
                      <td className="px-4 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={saveEdit}
                              disabled={editSaving}
                            >
                              {editSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5 text-plus" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={cancelEdit}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => confirmDelete(rowId)}
                              disabled={deletingId === rowId}
                            >
                              {deletingId === rowId ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
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
