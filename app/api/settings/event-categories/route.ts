import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const cats = await prisma.eventCategory.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(cats);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, contextMd, color } = await req.json();
  const cat = await prisma.eventCategory.create({
    data: { name, description, contextMd, color },
  });
  return NextResponse.json(cat, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, description, contextMd, color } = await req.json();
  const cat = await prisma.eventCategory.update({
    where: { id },
    data: { name, description, contextMd, color },
  });
  return NextResponse.json(cat);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.eventCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
