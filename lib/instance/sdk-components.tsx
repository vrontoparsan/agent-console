"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, ArrowUpDown, ChevronLeft, ChevronRight, Pencil, Trash2, Check, X, InboxIcon } from "lucide-react";

// ─── Re-export existing UI primitives ────────────────────────

export { Button } from "@/components/ui/button";
export { Input } from "@/components/ui/input";
export { Badge } from "@/components/ui/badge";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

// ─── DataTable ───────────────────────────────────────────────

type DataTableColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
};

type DataTableProps = {
  data: Record<string, unknown>[];
  columns: DataTableColumn[];
  loading?: boolean;
  onRowClick?: (row: Record<string, unknown>) => void;
  className?: string;
};

export function DataTable({
  data,
  columns,
  loading,
  onRowClick,
  className,
}: DataTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <InboxIcon className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No records found</p>
      </div>
    );
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
    return s.length > 100 ? s.slice(0, 100) + "..." : s;
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={(row.id as string) || i}
              className={cn(
                "border-b border-border/50 hover:bg-accent/30",
                onRowClick && "cursor-pointer"
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2.5 text-sm">
                  {col.render
                    ? col.render(row[col.key], row)
                    : formatCell(row[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string | number;
  description?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
};

export function StatCard({
  label,
  value,
  description,
  trend,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        className
      )}
    >
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-semibold">
        {typeof value === "number" ? value.toLocaleString("sk-SK") : value}
      </p>
      {description && (
        <p
          className={cn(
            "text-xs mt-1",
            trend === "up" && "text-green-500",
            trend === "down" && "text-red-500",
            (!trend || trend === "neutral") && "text-muted-foreground"
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

// ─── Select ──────────────────────────────────────────────────

type SelectProps = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function Select({
  options,
  value,
  onChange,
  placeholder,
  className,
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─── Tabs ────────────────────────────────────────────────────

type TabItem = {
  label: string;
  content: React.ReactNode;
};

type TabsProps = {
  items: TabItem[];
  defaultIndex?: number;
  className?: string;
};

export function Tabs({ items, defaultIndex = 0, className }: TabsProps) {
  const [activeIndex, setActiveIndex] = React.useState(defaultIndex);

  return (
    <div className={className}>
      <div className="flex border-b border-border gap-1">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors -mb-px cursor-pointer",
              i === activeIndex
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{items[activeIndex]?.content}</div>
    </div>
  );
}

// ─── Loading / Empty ─────────────────────────────────────────

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-8", className)}>
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export function EmptyState({
  message = "No data",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-muted-foreground",
        className
      )}
    >
      <InboxIcon className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
