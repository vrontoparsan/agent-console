import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";

export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  const crons = await ctx.db.cronJob.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(crons);
}

export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, schedule, action, enabled } = await req.json();
  const cron = await ctx.db.cronJob.create({
    data: { name, schedule, action, enabled: enabled ?? false },
  });
  return NextResponse.json(cron, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, schedule, action, enabled } = await req.json();
  const cron = await ctx.db.cronJob.update({
    where: { id },
    data: { name, schedule, action, enabled },
  });
  return NextResponse.json(cron);
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, enabled } = await req.json();
  const cron = await ctx.db.cronJob.update({
    where: { id },
    data: { enabled },
  });
  return NextResponse.json(cron);
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await ctx.db.cronJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
