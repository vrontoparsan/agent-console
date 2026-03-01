import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const crons = await prisma.cronJob.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(crons);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, schedule, action, enabled } = await req.json();
  const cron = await prisma.cronJob.create({
    data: { name, schedule, action, enabled: enabled ?? false },
  });
  return NextResponse.json(cron, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, schedule, action, enabled } = await req.json();
  const cron = await prisma.cronJob.update({
    where: { id },
    data: { name, schedule, action, enabled },
  });
  return NextResponse.json(cron);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, enabled } = await req.json();
  const cron = await prisma.cronJob.update({
    where: { id },
    data: { enabled },
  });
  return NextResponse.json(cron);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.cronJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
