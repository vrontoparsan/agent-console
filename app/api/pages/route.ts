import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  const userRole = ctx.role;
  const showAll = req.nextUrl.searchParams.get("all") === "1";

  // ADMIN
  if (["ADMIN"].includes(userRole)) {
    const pages = await ctx.db.customPage.findMany({
      where: showAll ? {} : { published: true },
      select: { id: true, slug: true, title: true, icon: true, order: true, published: true, code: true, categoryId: true, category: { select: { id: true, name: true } } },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(pages);
  }

  // MANAGER: only pages they have access to
  const accessList = await ctx.db.userPageAccess.findMany({
    where: { userId: ctx.session.user.id },
    select: { pageId: true },
  });
  const pageIds = accessList.map((a) => a.pageId);

  if (pageIds.length === 0) {
    return NextResponse.json([]);
  }

  const pages = await ctx.db.customPage.findMany({
    where: showAll
      ? { id: { in: pageIds } }
      : { published: true, id: { in: pageIds } },
    select: { id: true, slug: true, title: true, icon: true, order: true, published: true, code: true, categoryId: true, category: { select: { id: true, name: true } } },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(pages);
}

// POST: Create an empty section
export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, categoryId } = await req.json();
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Generate slug from title
  const slug = title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check for duplicate slug
  const existing = await ctx.db.customPage.findFirst({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Section with this slug already exists" }, { status: 409 });
  }

  const maxOrder = await ctx.db.customPage.aggregate({ _max: { order: true } });
  const page = await ctx.db.customPage.create({
    data: {
      title: title.trim(),
      slug,
      config: {},
      published: true,
      order: (maxOrder._max.order || 0) + 1,
      categoryId: categoryId || null,
    },
  });

  return NextResponse.json(page, { status: 201 });
}

// DELETE: Remove a section and its messages
export async function DELETE(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Delete related messages first
  await ctx.db.message.deleteMany({ where: { customPageId: id } });
  // Delete page access entries
  await ctx.db.userPageAccess.deleteMany({ where: { pageId: id } });
  // Delete the page
  await ctx.db.customPage.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

// PUT: Update a section's title
export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, title } = await req.json();
  if (!id || !title || typeof title !== "string") {
    return NextResponse.json({ error: "ID and title are required" }, { status: 400 });
  }

  const page = await ctx.db.customPage.update({
    where: { id },
    data: { title: title.trim() },
  });

  return NextResponse.json(page);
}

// PATCH: Batch reorder sections (update order and categoryId)
export async function PATCH(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: { id: string; order: number; categoryId: string | null }[] = await req.json();

  await ctx.db.$transaction(
    items.map((item) =>
      ctx.db.customPage.update({
        where: { id: item.id },
        data: { order: item.order, categoryId: item.categoryId },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
