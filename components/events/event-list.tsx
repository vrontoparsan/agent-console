"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { EventCard } from "./event-card";
import { EventModal } from "./event-modal";
import { NewEventForm } from "./new-event-form";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

type EventWithRelations = {
  id: string;
  title: string;
  summary: string | null;
  rawContent: string | null;
  source: string | null;
  type: "PLUS" | "MINUS";
  status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED";
  priority: number;
  categoryId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  category: { id: string; name: string; color: string | null } | null;
  actions: { id: string; title: string; description: string | null; status: string }[];
  _count: { messages: number };
};

const filters = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In Progress" },
  { key: "unresolved", label: "Unresolved" },
];

export function EventList({
  events,
  total,
  page,
  pageSize,
  filter,
}: {
  events: EventWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  filter: string;
}) {
  const router = useRouter();
  const [selectedEvent, setSelectedEvent] = useState<EventWithRelations | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const totalPages = Math.ceil(total / pageSize);

  function setFilter(f: string) {
    router.push(`/events?filter=${f}`);
  }

  function setPage(p: number) {
    router.push(`/events?filter=${filter}&page=${p}`);
  }

  return (
    <>
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold tracking-tight">Events</h1>
          <Button size="sm" onClick={() => setShowNewEvent(true)}>
            <Plus className="h-4 w-4" />
            New Event
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                filter === f.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-sm text-muted-foreground self-center">
            {total} event{total !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Inbox className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No events yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => setSelectedEvent(event)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-border px-6 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
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

      {/* Event Modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* New Event Form */}
      {showNewEvent && (
        <NewEventForm onClose={() => setShowNewEvent(false)} />
      )}
    </>
  );
}

function Inbox({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  );
}
