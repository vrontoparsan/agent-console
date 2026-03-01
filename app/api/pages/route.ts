import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const pages = await prisma.customPage.findMany({
    where: { published: true },
    select: { slug: true, title: true, icon: true, order: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(pages);
}
