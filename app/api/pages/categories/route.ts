import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";

// GET: List all categories with their pages
export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categories = await ctx.db.sectionCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      pages: {
        orderBy: { order: "asc" },
        select: { id: true, slug: true, title: true, published: true, order: true, categoryId: true },
      },
    },
  });

  return NextResponse.json(categories);
}

// POST: Create a category
export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const maxOrder = await ctx.db.sectionCategory.aggregate({ _max: { order: true } });
  const category = await ctx.db.sectionCategory.create({
    data: {
      name: name.trim(),
      order: (maxOrder._max.order || 0) + 1,
    },
  });

  return NextResponse.json(category, { status: 201 });
}

// DELETE: Remove a category (pages become uncategorized)
export async function DELETE(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  // Nullify categoryId on pages first
  await ctx.db.customPage.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });

  await ctx.db.sectionCategory.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

// PUT: Rename a category
export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name } = await req.json();
  if (!id || !name || typeof name !== "string") {
    return NextResponse.json({ error: "ID and name are required" }, { status: 400 });
  }

  const category = await ctx.db.sectionCategory.update({
    where: { id },
    data: { name: name.trim() },
  });

  return NextResponse.json(category);
}

// PATCH: Batch reorder categories
export async function PATCH(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;
  if (!["ADMIN"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: { id: string; order: number }[] = await req.json();

  await ctx.db.$transaction(
    items.map((item) =>
      ctx.db.sectionCategory.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
