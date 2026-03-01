"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatPanel } from "@/components/chat/chat-panel";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  FileText,
  Check,
  X,
  Loader2,
  Mail,
} from "lucide-react";

type EventModalProps = {
  event: {
    id: string;
    title: string;
    summary: string | null;
    rawContent: string | null;
    source: string | null;
    type: "PLUS" | "MINUS";
    status: string;
    priority: number;
    senderEmail: string | null;
    senderName: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    category: { id: string; name: string; color: string | null } | null;
    emailAccount: { id: string; label: string; email: string } | null;
    actions: {
      id: string;
      title: string;
      description: string | null;
      status: string;
    }[];
  };
  onClose: () => void;
};

export function EventModal({ event, onClose }: EventModalProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(actionId: string, approve: boolean) {
    setActionLoading(actionId);
    try {
      await fetch(`/api/events/${event.id}/actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: approve ? "APPROVED" : "REJECTED",
        }),
      });
      // Refresh would happen via router.refresh() in real app
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="lg"
          onClick={onClose}
          className="gap-2 text-base"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </Button>

        <div className="flex items-center gap-3 flex-1">
          {event.type === "PLUS" ? (
            <TrendingUp className="h-5 w-5 text-plus" />
          ) : (
            <TrendingDown className="h-5 w-5 text-minus" />
          )}
          <h2 className="text-lg font-semibold truncate">{event.title}</h2>
          {event.category && (
            <Badge variant="outline">{event.category.name}</Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Event details */}
        <div className="flex-1 border-r border-border overflow-auto">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-6">
              {/* Email Source */}
              {event.emailAccount && (
                <section className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{event.emailAccount.label}</p>
                    <p className="text-muted-foreground text-xs">
                      Received via {event.emailAccount.email}
                    </p>
                    {(event.senderName || event.senderEmail) && (
                      <p className="text-muted-foreground text-xs">
                        From: {event.senderName}{event.senderName && event.senderEmail ? " " : ""}{event.senderEmail && <span className="font-mono">&lt;{event.senderEmail}&gt;</span>}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Summary */}
              {event.summary && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Summary
                  </h3>
                  <p className="text-sm leading-relaxed">{event.summary}</p>
                </section>
              )}

              {/* Recognized data */}
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Recognized Data
                  </h3>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <dl className="grid grid-cols-2 gap-3">
                      {Object.entries(event.metadata).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground uppercase tracking-wider">
                            {key}
                          </dt>
                          <dd className="text-sm mt-0.5">
                            {String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </section>
              )}

              {/* Original content */}
              {event.rawContent && (
                <section>
                  <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <FileText className="h-4 w-4" />
                    {showRaw ? "Hide" : "Show"} original content
                  </button>
                  {showRaw && (
                    <pre className="mt-2 p-4 rounded-lg bg-card border border-border text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64">
                      {event.rawContent}
                    </pre>
                  )}
                </section>
              )}

              {/* AI Actions */}
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  AI Suggested Actions
                </h3>
                <div className="space-y-2">
                  {event.actions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No actions suggested yet.
                    </p>
                  ) : (
                    event.actions.map((action) => (
                      <div
                        key={action.id}
                        className="rounded-lg border border-border bg-card p-4 flex items-start gap-3"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{action.title}</p>
                          {action.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {action.description}
                            </p>
                          )}
                        </div>
                        {action.status === "SUGGESTED" && (
                          <div className="flex gap-1.5 flex-shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(action.id, true)}
                              disabled={actionLoading === action.id}
                              className="text-plus hover:bg-plus/10"
                            >
                              {actionLoading === action.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(action.id, false)}
                              disabled={actionLoading === action.id}
                              className="text-minus hover:bg-minus/10"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {action.status !== "SUGGESTED" && (
                          <Badge
                            variant={
                              action.status === "APPROVED" ||
                              action.status === "COMPLETED"
                                ? "resolved"
                                : action.status === "REJECTED"
                                  ? "minus"
                                  : "progress"
                            }
                          >
                            {action.status}
                          </Badge>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
        </div>

        {/* Right: Event chat */}
        <div className="w-[400px] flex-shrink-0">
          <ChatPanel eventId={event.id} eventTitle={event.title} />
        </div>
      </div>
    </div>
  );
}
