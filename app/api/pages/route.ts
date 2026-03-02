import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const userRole = session.user.role;
  const showAll = req.nextUrl.searchParams.get("all") === "1";

  // SUPERADMIN and ADMIN
  if (["SUPERADMIN", "ADMIN"].includes(userRole)) {
    const pages = await prisma.customPage.findMany({
      where: showAll ? {} : { published: true },
      select: { id: true, slug: true, title: true, icon: true, order: true, published: true, code: true, categoryId: true, category: { select: { id: true, name: true } } },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(pages);
  }

  // MANAGER: only pages they have access to
  const accessList = await prisma.userPageAccess.findMany({
    where: { userId: session.user.id },
    select: { pageId: true },
  });
  const pageIds = accessList.map((a) => a.pageId);

  if (pageIds.length === 0) {
    return NextResponse.json([]);
  }

  const pages = await prisma.customPage.findMany({
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
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
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
  const existing = await prisma.customPage.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Section with this slug already exists" }, { status: 409 });
  }

  const maxOrder = await prisma.customPage.aggregate({ _max: { order: true } });
  const page = await prisma.customPage.create({
    data: {
      title: title.trim(),
      slug,
      config: {},
      published: false,
      order: (maxOrder._max.order || 0) + 1,
      categoryId: categoryId || null,
    },
  });

  return NextResponse.json(page, { status: 201 });
}

// DELETE: Remove a section and its messages
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  // Delete related messages first
  await prisma.message.deleteMany({ where: { customPageId: id } });
  // Delete page access entries
  await prisma.userPageAccess.deleteMany({ where: { pageId: id } });
  // Delete the page
  await prisma.customPage.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

// PATCH: Batch reorder sections (update order and categoryId)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items: { id: string; order: number; categoryId: string | null }[] = await req.json();

  await prisma.$transaction(
    items.map((item) =>
      prisma.customPage.update({
        where: { id: item.id },
        data: { order: item.order, categoryId: item.categoryId },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
