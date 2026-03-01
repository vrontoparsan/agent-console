import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const contexts = await prisma.agentContext.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(contexts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, type, content, enabled, order } = await req.json();
  const ctx = await prisma.agentContext.create({
    data: { name, type, content, enabled: enabled ?? true, order: order ?? 0 },
  });
  return NextResponse.json(ctx, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, type, content, enabled, order } = await req.json();
  const ctx = await prisma.agentContext.update({
    where: { id },
    data: { name, type, content, enabled, order },
  });
  return NextResponse.json(ctx);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.agentContext.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
