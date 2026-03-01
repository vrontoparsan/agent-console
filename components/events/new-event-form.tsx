"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Upload,
  FileText,
  Loader2,
  Plus,
  Minus,
  Paperclip,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ParsedFile = {
  filename: string;
  content: string;
  error?: string;
};

const ACCEPTED_EXTENSIONS =
  ".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.xml";

export function NewEventForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"PLUS" | "MINUS">("PLUS");
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    for (let i = 0; i < selected.length; i++) {
      formData.append("files", selected[i]);
    }

    try {
      const res = await fetch("/api/files/parse", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setFiles((prev) => [...prev, ...data.files]);
    } catch {
      setError("Failed to process files");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    setError("");

    const fileContents = files
      .filter((f) => !f.error && f.content)
      .map((f) => `--- ${f.filename} ---\n${f.content}`)
      .join("\n\n");

    const rawContent = [content, fileContents].filter(Boolean).join("\n\n");

    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          summary: content.trim() || null,
          rawContent: rawContent || null,
          type,
          source: "manual",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to create event");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">New Event</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
          {/* Type toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setType("PLUS")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                type === "PLUS"
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <Plus className="h-4 w-4" />
              Positive
            </button>
            <button
              onClick={() => setType("MINUS")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                type === "MINUS"
                  ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                  : "bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <Minus className="h-4 w-4" />
              Negative
            </button>
          </div>

          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief event title..."
              autoFocus
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Description
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe the event in detail. Paste email content, notes, or any relevant information..."
              className="w-full min-h-[180px] rounded-lg border border-input bg-background px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              rows={8}
            />
          </div>

          {/* File attachments */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Attachments
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Uploaded files list */}
            {files.length > 0 && (
              <div className="space-y-2 mb-3">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                      file.error
                        ? "bg-red-500/10 border border-red-500/20"
                        : "bg-accent/50 border border-border"
                    )}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{file.filename}</span>
                    {file.error ? (
                      <span className="text-xs text-red-400 shrink-0">
                        {file.error}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {file.content.length.toLocaleString()} chars
                      </span>
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full justify-center"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing files...
                </>
              ) : (
                <>
                  <Paperclip className="h-4 w-4" />
                  Attach files
                  <span className="text-xs text-muted-foreground/70 ml-1">
                    pdf, docx, txt, md, xlsx, csv, xml
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !title.trim()}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Create Event
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
