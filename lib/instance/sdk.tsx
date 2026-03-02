"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────

type CstmQueryOptions = {
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
  search?: string;
  filters?: Record<string, string>;
};

type CstmQueryResult<T = Record<string, unknown>> = {
  data: T[];
  columns: { key: string; type: string }[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

type CstmMutationResult = {
  create: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  update: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  remove: (id: string) => Promise<void>;
  loading: boolean;
  error: string | null;
};

type AIResult = {
  ask: (prompt: string, options?: { context?: unknown }) => Promise<string>;
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
};

// ─── useCstmQuery ────────────────────────────────────────────

export function useCstmQuery<T = Record<string, unknown>>(
  table: string,
  options: CstmQueryOptions = {}
): CstmQueryResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [columns, setColumns] = useState<{ key: string; type: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const optionsKey = JSON.stringify(options);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        table,
        page: String(options.page || 1),
        pageSize: String(options.pageSize || 20),
      });
      if (options.sort) {
        params.set("sort", options.sort);
        params.set("dir", options.dir || "desc");
      }
      if (options.search) params.set("search", options.search);
      if (options.filters) {
        for (const [k, v] of Object.entries(options.filters)) {
          if (v) params.set(`filter_${k}`, v);
        }
      }
      const res = await globalThis.fetch(`/api/cstm?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
      setColumns(json.columns || []);
      setTotal(json.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, optionsKey]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  // Auto-refetch on data changes
  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.table || detail.table === table) fetch_();
    }
    globalThis.addEventListener("cstm-data-changed", handle);
    return () => globalThis.removeEventListener("cstm-data-changed", handle);
  }, [table, fetch_]);

  return { data, columns, total, loading, error, refetch: fetch_ };
}

// ─── useCstmMutation ─────────────────────────────────────────

export function useCstmMutation(table: string): CstmMutationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dispatch = () => {
    globalThis.dispatchEvent(
      new CustomEvent("cstm-data-changed", { detail: { table } })
    );
  };

  const create = useCallback(
    async (data: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await globalThis.fetch("/api/cstm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, data }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        const result = await res.json();
        dispatch();
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Create failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table]
  );

  const update = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      setLoading(true);
      setError(null);
      try {
        const res = await globalThis.fetch("/api/cstm", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table, id, data }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        const result = await res.json();
        dispatch();
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Update failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table]
  );

  const remove = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await globalThis.fetch(
          `/api/cstm?table=${table}&id=${id}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        dispatch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table]
  );

  return { create, update, remove, loading, error };
}

// ─── useAI ───────────────────────────────────────────────────

export function useAI(): AIResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  const ask = useCallback(
    async (prompt: string, options?: { context?: unknown }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await globalThis.fetch("/api/instance/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, context: options?.context }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setLastResponse(json.response);
        return json.response as string;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI request failed";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { ask, loading, error, lastResponse };
}

// ─── SDK Utilities ───────────────────────────────────────────

export const sdk = {
  notify: (message: string, type?: "success" | "error" | "info") => {
    globalThis.dispatchEvent(
      new CustomEvent("instance-notify", {
        detail: { message, type: type || "info" },
      })
    );
  },

  navigate: (path: string) => {
    if (path.startsWith("/p/")) {
      globalThis.dispatchEvent(
        new CustomEvent("instance-navigate", { detail: { path } })
      );
    }
  },

  formatDate: (date: string | Date, locale?: string) => {
    return new Date(date).toLocaleDateString(locale || "sk-SK", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  },

  formatDateTime: (date: string | Date, locale?: string) => {
    return new Date(date).toLocaleDateString(locale || "sk-SK", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },

  formatCurrency: (amount: number, currency?: string) => {
    return new Intl.NumberFormat("sk-SK", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount);
  },

  formatNumber: (n: number) => {
    return new Intl.NumberFormat("sk-SK").format(n);
  },

  download: async (url: string, filename: string) => {
    const res = await globalThis.fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  sendEmail: async (to: string, subject: string, body: string) => {
    const res = await globalThis.fetch("/api/instance/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    });
    if (!res.ok) throw new Error("Email send failed");
    return res.json();
  },
};
