import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const userRole = session.user.role;

  // SUPERADMIN and ADMIN see all published pages
  if (["SUPERADMIN", "ADMIN"].includes(userRole)) {
    const pages = await prisma.customPage.findMany({
      where: { published: true },
      select: { id: true, slug: true, title: true, icon: true, order: true },
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
    where: { published: true, id: { in: pageIds } },
    select: { id: true, slug: true, title: true, icon: true, order: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(pages);
}
