import { prisma } from "@/lib/prisma";
import { EventList } from "@/components/events/event-list";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter || "all";
  const page = parseInt(params.page || "1");
  const pageSize = 20;

  const where =
    filter === "in_progress"
      ? { status: "IN_PROGRESS" as const }
      : filter === "unresolved"
        ? { status: { in: ["NEW" as const, "IN_PROGRESS" as const] } }
        : {};

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        category: true,
        actions: { where: { status: "SUGGESTED" }, take: 3 },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.event.count({ where }),
  ]);

  return (
    <div className="flex-1 flex flex-col">
      <EventList
        events={JSON.parse(JSON.stringify(events))}
        total={total}
        page={page}
        pageSize={pageSize}
        filter={filter}
      />
    </div>
  );
}
