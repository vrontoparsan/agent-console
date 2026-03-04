"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search } from "lucide-react";

type ModelInfo = {
  name: string;
  count: number;
  type: "prisma";
  tenantScoped: boolean;
};

type CustomTableInfo = {
  schema: string;
  table: string;
  tenantId: string;
};

type DataResponse = {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export default function DatabaseBrowserPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [customTables, setCustomTables] = useState<CustomTableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Data panel state
  const [selectedTable, setSelectedTable] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [data, setData] = useState<DataResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());

  // Load table list
  useEffect(() => {
    fetch("/api/superadmin/database?action=tables")
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models || []);
        setCustomTables(d.customTables || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load data when table/page/filter changes
  const loadData = useCallback(async (table: string, pg: number, tenant: string) => {
    if (!table) return;
    setDataLoading(true);
    setExpandedRow(null);
    const params = new URLSearchParams({
      action: "data",
      table,
      page: String(pg),
      pageSize: "50",
    });
    if (tenant) params.set("tenantId", tenant);

    try {
      const r = await fetch(`/api/superadmin/database?${params}`);
      const d = await r.json();
      setData(d);
    } catch {
      setData(null);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (selectedTable) loadData(selectedTable, page, tenantFilter);
  }, [selectedTable, page, tenantFilter, loadData]);

  function selectTable(table: string) {
    setSelectedTable(table);
    setPage(1);
    setTenantFilter("");
    setExpandedRow(null);
  }

  function toggleSchema(schema: string) {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schema)) next.delete(schema);
      else next.add(schema);
      return next;
    });
  }

  // Get unique tenant IDs from custom tables
  const tenantSchemas = Array.from(new Set(customTables.map((t) => t.schema))).sort();

  // Get unique tenants for filter dropdown (from models list or custom tables)
  const tenantIds = Array.from(new Set(customTables.map((t) => t.tenantId))).sort();

  // Filter models/tables by search
  const filteredModels = models.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSchemas = tenantSchemas.filter(
    (s) =>
      s.toLowerCase().includes(search.toLowerCase()) ||
      customTables
        .filter((t) => t.schema === s)
        .some((t) => t.table.toLowerCase().includes(search.toLowerCase()))
  );

  // Is current table tenant-scoped?
  const isScoped = models.find((m) => m.name === selectedTable)?.tenantScoped || false;

  // Column names from data
  const columns = data?.rows?.[0] ? Object.keys(data.rows[0]) : [];

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value).slice(0, 120);
    const s = String(value);
    if (s.length > 100) return s.slice(0, 100) + "...";
    return s;
  }

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="flex h-screen">
      {/* Left sidebar — table list */}
      <div className="w-64 border-r border-border flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search tables..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Prisma models */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">
              Core Tables
            </div>
            {filteredModels.map((m) => (
              <button
                key={m.name}
                onClick={() => selectTable(m.name)}
                className={`w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors ${
                  selectedTable === m.name ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <span className="truncate">{m.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                  {m.count}
                </Badge>
              </button>
            ))}
          </div>

          {/* Tenant schemas */}
          {filteredSchemas.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">
                Tenant Schemas
              </div>
              {filteredSchemas.map((schema) => {
                const tables = customTables.filter((t) => t.schema === schema);
                const isExpanded = expandedSchemas.has(schema);
                return (
                  <div key={schema}>
                    <button
                      onClick={() => toggleSchema(schema)}
                      className="w-full flex items-center gap-1 rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <span className="truncate">{schema}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
                        {tables.length}
                      </Badge>
                    </button>
                    {isExpanded &&
                      tables.map((t) => (
                        <button
                          key={`${t.schema}.${t.table}`}
                          onClick={() => selectTable(`${t.schema}.${t.table}`)}
                          className={`w-full text-left rounded-md px-2 py-1 text-xs pl-7 hover:bg-accent transition-colors ${
                            selectedTable === `${t.schema}.${t.table}`
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {t.table}
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — data view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedTable ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a table from the sidebar
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="border-b border-border px-4 py-3 flex items-center gap-3">
              <h2 className="font-semibold text-sm">{selectedTable}</h2>
              {data && (
                <Badge variant="secondary" className="text-xs">
                  {data.total} rows
                </Badge>
              )}
              {isScoped && (
                <select
                  value={tenantFilter}
                  onChange={(e) => {
                    setTenantFilter(e.target.value);
                    setPage(1);
                  }}
                  className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">All tenants</option>
                  {tenantIds.map((tid) => (
                    <option key={tid} value={tid}>
                      {tid}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {dataLoading ? (
                <div className="p-8 text-muted-foreground text-sm">Loading...</div>
              ) : !data?.rows?.length ? (
                <div className="p-8 text-muted-foreground text-sm">No data</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 sticky top-0">
                      <th className="text-left px-3 py-2 font-medium w-8">#</th>
                      {columns.map((col) => (
                        <th
                          key={col}
                          className="text-left px-3 py-2 font-medium whitespace-nowrap max-w-[200px]"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <>
                        <tr
                          key={i}
                          onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                          className="border-b border-border hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {(data.page - 1) * data.pageSize + i + 1}
                          </td>
                          {columns.map((col) => (
                            <td
                              key={col}
                              className="px-3 py-1.5 max-w-[200px] truncate"
                              title={String(row[col] ?? "")}
                            >
                              {formatCell(row[col])}
                            </td>
                          ))}
                        </tr>
                        {expandedRow === i && (
                          <tr key={`${i}-expanded`} className="border-b border-border">
                            <td colSpan={columns.length + 1} className="p-0">
                              <pre className="p-3 text-xs bg-muted/20 overflow-x-auto max-h-[300px] whitespace-pre-wrap">
                                {JSON.stringify(row, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {data && data.pages > 1 && (
              <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Page {data.page} of {data.pages} ({data.total} rows)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={page >= data.pages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
