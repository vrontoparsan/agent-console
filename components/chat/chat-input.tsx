"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Send, Paperclip, X, FileText, Image } from "lucide-react";
import { cn } from "@/lib/utils";

export type AttachedFile = {
  file: File;
  name: string;
  type: "image" | "document";
  preview?: string; // data URL for image preview
};

const ACCEPTED_TYPES = [
  // Documents
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/xml",
  "application/xml",
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

const ACCEPT_STRING = ".pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.xml,.png,.jpg,.jpeg,.gif,.webp";

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (content: string, files?: AttachedFile[]) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const trimmed = value.trim();
    if ((!trimmed && files.length === 0) || disabled) return;
    onSend(trimmed || "(see attached files)", files.length > 0 ? files : undefined);
    setValue("");
    setFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: AttachedFile[] = [];
    for (const file of Array.from(selectedFiles)) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue;

      const attached: AttachedFile = {
        file,
        name: file.name,
        type: isImageFile(file) ? "image" : "document",
      };

      // Create preview for images
      if (isImageFile(file)) {
        attached.preview = URL.createObjectURL(file);
      }

      newFiles.push(attached);
    }

    setFiles((prev) => [...prev, ...newFiles]);
    // Reset input so the same file can be selected again
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const f = prev[index];
      if (f.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  return (
    <div className="border-t border-border p-3">
      {/* Attached files preview */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent text-xs"
            >
              {f.type === "image" ? (
                f.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.preview} alt="" className="h-5 w-5 rounded object-cover" />
                ) : (
                  <Image className="h-3.5 w-3.5 text-muted-foreground" />
                )
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File attachment button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 text-muted-foreground"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={files.length > 0 ? "Add a message about the files..." : "Type a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && files.length === 0)}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
