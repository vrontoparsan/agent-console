"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table2,
  ChevronLeft,
  ChevronRight,
  Search,
  Database,
  MessageSquare,
  Boxes,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AgentChat } from "@/components/custom-page/agent-chat";

const coreTables = [
  { key: "Event", label: "Events" },
  { key: "User", label: "Users" },
  { key: "EventAction", label: "Actions" },
  { key: "Message", label: "Messages" },
  { key: "EventCategory", label: "Categories" },
  { key: "AgentContext", label: "Contexts" },
  { key: "CompanyInfo", label: "Company" },
  { key: "CronJob", label: "Cron Jobs" },
  { key: "EmailAccount", label: "Email Accounts" },
  { key: "CustomPage", label: "Custom Pages" },
];

type Row = Record<string, unknown>;

export default function DataPage() {
  const [mode, setMode] = useState<"browse" | "chat">("browse");
  const [selectedTable, setSelectedTable] = useState("Event");
  const [data, setData] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [instanceTables, setInstanceTables] = useState<string[]>([]);
  const pageSize = 25;

  // Load instance tables on mount
  useEffect(() => {
    fetch("/api/data?list=instance")
      .then((r) => (r.ok ? r.json() : []))
      .then(setInstanceTables)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedTable, page]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/data?table=${selectedTable}&page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
        setColumns(result.columns || []);
        setTotal(result.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadData();
  }

  const totalPages = Math.ceil(total / pageSize);

  if (mode === "chat") {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-border px-6 py-3 flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Data</h1>
          <div className="flex gap-1 ml-4">
            <button
              onClick={() => setMode("browse")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              <Table2 className="h-4 w-4 inline mr-1.5" />
              Browse
            </button>
            <button
              onClick={() => setMode("chat")}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary transition-colors cursor-pointer"
            >
              <MessageSquare className="h-4 w-4 inline mr-1.5" />
              Agent Chat
            </button>
          </div>
        </div>
        <AgentChat context="data" className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      {/* Left sidebar - table list */}
      <div className="w-52 border-r border-border flex flex-col">
        <div className="px-3 py-3 border-b border-border">
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <Database className="h-4 w-4" />
            Tables
          </div>
        </div>
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-0.5">
            <div className="px-2 pt-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Core</span>
            </div>
            {coreTables.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setSelectedTable(t.key);
                  setPage(1);
                  setSearch("");
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                  selectedTable === t.key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {t.label}
              </button>
            ))}

            {instanceTables.length > 0 && (
              <>
                <div className="px-2 pt-3 pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
                    <Boxes className="h-3 w-3" />
                    Instance
                  </span>
                </div>
                {instanceTables.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setSelectedTable(t);
                      setPage(1);
                      setSearch("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors cursor-pointer",
                      selectedTable === t
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </>
            )}
          </nav>
        </ScrollArea>
      </div>

      {/* Main content - data table */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Search bar */}
        <div className="border-b border-border px-4 py-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Table2 className="h-4 w-4" />
            {coreTables.find((t) => t.key === selectedTable)?.label || selectedTable}
            {selectedTable.startsWith("cstm_") || selectedTable.startsWith("custom_") ? (
              <Badge variant="outline" className="text-[10px] h-4 font-normal">Instance</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-4 font-normal">Core</Badge>
            )}
          </h2>
          <button
            onClick={() => setMode("chat")}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer flex items-center gap-1"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <form onSubmit={handleSearch} className="ml-auto flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-8 h-8 w-56"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Search
            </Button>
          </form>
          <span className="text-xs text-muted-foreground">
            {total} row{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Table2 className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No data</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/50 sticky top-0">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                  >
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 truncate max-w-[200px]">
                        {formatCell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-2 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 100);
  const str = String(value);
  if (str.match(/^\d{4}-\d{2}-\d{2}T/)) {
    return new Date(str).toLocaleString("sk-SK");
  }
  return str.length > 80 ? str.slice(0, 80) + "..." : str;
}
