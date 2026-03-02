import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List all categories with their pages
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const categories = await prisma.sectionCategory.findMany({
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const maxOrder = await prisma.sectionCategory.aggregate({ _max: { order: true } });
  const category = await prisma.sectionCategory.create({
    data: {
      name: name.trim(),
      order: (maxOrder._max.order || 0) + 1,
    },
  });

  return NextResponse.json(category, { status: 201 });
}

// DELETE: Remove a category (pages become uncategorized)
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  // Nullify categoryId on pages first
  await prisma.customPage.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });

  await prisma.sectionCategory.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

// PATCH: Batch reorder categories
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: { id: string; order: number }[] = await req.json();

  await prisma.$transaction(
    items.map((item) =>
      prisma.sectionCategory.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
