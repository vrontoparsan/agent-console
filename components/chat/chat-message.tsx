"use client";

import { cn } from "@/lib/utils";
import { User, Bot } from "lucide-react";
import { MarkdownContent } from "./markdown";

type ChatMessageProps = {
  message: {
    content: string;
    role: "user" | "assistant";
    createdAt: string;
  };
};

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary/10 text-primary"
            : "bg-secondary text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          "rounded-xl px-3.5 py-2.5 max-w-[80%] text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>
    </div>
  );
}
