import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // All custom pages with message counts
  const pages = await ctx.db.customPage.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      icon: true,
      published: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Orphan threads (new sections not yet linked to a page)
  const orphans = await ctx.db.message.groupBy({
    by: ["threadId"],
    where: { threadId: { not: null }, customPageId: null },
    _count: true,
    _min: { createdAt: true },
  });

  return NextResponse.json({
    pages: pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      icon: p.icon,
      published: p.published,
      messageCount: p._count.messages,
      updatedAt: p.updatedAt,
    })),
    orphanThreads: orphans.map((o) => ({
      threadId: o.threadId,
      messageCount: o._count,
      createdAt: o._min.createdAt,
    })),
  });
}
