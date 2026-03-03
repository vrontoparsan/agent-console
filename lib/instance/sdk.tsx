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
  ask: (prompt: string, options?: { context?: unknown; images?: string[] }) => Promise<string>;
  loading: boolean;
  error: string | null;
  lastResponse: string | null;
};

type CameraResult = {
  /** Open native camera (mobile) or file picker (desktop) */
  capture: () => void;
  /** Base64 data URL of captured image (image/jpeg) */
  image: string | null;
  /** Processing the captured image */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Clear captured image */
  clear: () => void;
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
    async (prompt: string, options?: { context?: unknown; images?: string[] }) => {
      setLoading(true);
      setError(null);
      try {
        // Strip data URL prefix from images for API
        const images = options?.images?.map((img) => {
          const match = img.match(/^data:[^;]+;base64,(.+)$/);
          return match ? match[1] : img;
        });

        const res = await globalThis.fetch("/api/instance/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, context: options?.context, images }),
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

// ─── useVoice ───────────────────────────────────────────────

type VoiceResult = {
  /** Start recording from microphone */
  start: () => void;
  /** Stop recording and begin transcription */
  stop: () => void;
  /** Whether currently recording */
  recording: boolean;
  /** Whether transcription is in progress */
  transcribing: boolean;
  /** Last transcribed text */
  text: string | null;
  /** Error message */
  error: string | null;
};

export function useVoice(options?: { maxDuration?: number; prompt?: string }): VoiceResult {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const maxDur = ((options?.maxDuration || 30) * 1000);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transcribe = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "voice.webm");
      if (options?.prompt) formData.append("prompt", options.prompt);

      const res = await globalThis.fetch("/api/instance/voice", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setText(json.text || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.prompt]);

  const start = useCallback(() => {
    if (recording) return;
    setError(null);
    setText(null);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Mikrofón nie je dostupný");
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size > 0) {
          transcribe(blob);
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
        setError("Chyba pri nahrávaní");
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);

      timerRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, maxDur);
    }).catch((err) => {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Mikrofón zamietnutý. Povoľte v prehliadači.");
      } else {
        setError("Nepodarilo sa získať mikrofón");
      }
    });
  }, [recording, maxDur, transcribe]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  return { start, stop, recording, transcribing, text, error };
}

// ─── useCamera ──────────────────────────────────────────────

const MAX_IMAGE_SIZE = 1600; // Max dimension in pixels
const JPEG_QUALITY = 0.85;

function resizeImage(dataUrl: string, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

export function useCamera(): CameraResult {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Create hidden file input on mount
  useEffect(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.style.display = "none";
    document.body.appendChild(input);
    inputRef.current = input;

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      setLoading(true);
      setError(null);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        const resized = await resizeImage(dataUrl, MAX_IMAGE_SIZE);
        setImage(resized);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to process image");
      } finally {
        setLoading(false);
        input.value = "";
      }
    });

    return () => {
      document.body.removeChild(input);
      inputRef.current = null;
    };
  }, []);

  const capture = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.click();
    }
  }, []);

  const clear = useCallback(() => {
    setImage(null);
    setError(null);
  }, []);

  return { capture, image, loading, error, clear };
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
