"use client";

import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, MessageSquare } from "lucide-react";

type EventCardProps = {
  event: {
    id: string;
    title: string;
    type: "PLUS" | "MINUS";
    status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED";
    priority: number;
    createdAt: string;
    category: { name: string; color: string | null } | null;
    actions: { id: string; title: string }[];
    _count: { messages: number };
  };
  onClick: () => void;
};

const statusVariant: Record<string, "new" | "progress" | "resolved" | "secondary"> = {
  NEW: "new",
  IN_PROGRESS: "progress",
  RESOLVED: "resolved",
  ARCHIVED: "secondary",
};

const statusLabel: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  ARCHIVED: "Archived",
};

export function EventCard({ event, onClick }: EventCardProps) {
  const time = new Date(event.createdAt);
  const timeStr = time.toLocaleDateString("sk-SK", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-6 py-3.5 hover:bg-accent/50 cursor-pointer transition-colors group"
    >
      {/* Type indicator */}
      <div className="flex-shrink-0">
        {event.type === "PLUS" ? (
          <div className="h-8 w-8 rounded-full bg-plus/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-plus" />
          </div>
        ) : (
          <div className="h-8 w-8 rounded-full bg-minus/10 flex items-center justify-center">
            <TrendingDown className="h-4 w-4 text-minus" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{event.title}</span>
          {event.priority > 0 && (
            <span className="text-xs text-primary font-mono">P{event.priority}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {event.category && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: event.category.color
                  ? event.category.color + "20"
                  : "var(--color-accent)",
                color: event.category.color || "var(--color-muted-foreground)",
              }}
            >
              {event.category.name}
            </span>
          )}
          {event.actions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {event.actions.length} action{event.actions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {event._count.messages > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-xs">{event._count.messages}</span>
          </div>
        )}
        <Badge variant={statusVariant[event.status] || "secondary"}>
          {statusLabel[event.status] || event.status}
        </Badge>
        <span className="text-xs text-muted-foreground w-24 text-right">
          {timeStr}
        </span>
      </div>
    </div>
  );
}
