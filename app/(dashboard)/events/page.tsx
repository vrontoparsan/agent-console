import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EventList } from "@/components/events/event-list";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const filter = params.filter || "all";
  const page = parseInt(params.page || "1");
  const pageSize = 20;

  // Build base filter
  const statusFilter =
    filter === "in_progress"
      ? { status: "IN_PROGRESS" as const }
      : filter === "unresolved"
        ? { status: { in: ["NEW" as const, "IN_PROGRESS" as const] } }
        : {};

  // MANAGER permission filtering
  let permissionFilter = {};
  if (session.user.role === "MANAGER") {
    const [catAccess, emailAccess] = await Promise.all([
      prisma.userCategoryAccess.findMany({
        where: { userId: session.user.id },
        select: { categoryId: true },
      }),
      prisma.userEmailAccountAccess.findMany({
        where: { userId: session.user.id },
        select: { emailAccountId: true },
      }),
    ]);

    const allowedCategoryIds = catAccess.map((a) => a.categoryId);
    const allowedEmailAccountIds = emailAccess.map((a) => a.emailAccountId);

    // Build OR clause: event matches allowed category OR allowed email account
    const orConditions = [];
    if (allowedCategoryIds.length > 0) {
      orConditions.push({ categoryId: { in: allowedCategoryIds } });
    }
    if (allowedEmailAccountIds.length > 0) {
      orConditions.push({ emailAccountId: { in: allowedEmailAccountIds } });
    }

    if (orConditions.length === 0) {
      // No access at all — show nothing
      permissionFilter = { id: "__none__" };
    } else {
      permissionFilter = { OR: orConditions };
    }
  }

  const where = { ...statusFilter, ...permissionFilter };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        category: true,
        emailAccount: { select: { id: true, label: true, email: true } },
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
    <div className="flex-1 flex flex-col min-h-0">
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
