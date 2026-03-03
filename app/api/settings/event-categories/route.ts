import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";

export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  const cats = await ctx.db.eventCategory.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(cats);
}

export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, contextMd, color } = await req.json();
  const cat = await ctx.db.eventCategory.create({
    data: { name, description, contextMd, color },
  });
  return NextResponse.json(cat, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, description, contextMd, color } = await req.json();
  const cat = await ctx.db.eventCategory.update({
    where: { id },
    data: { name, description, contextMd, color },
  });
  return NextResponse.json(cat);
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (!["ADMIN", "MANAGER"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await ctx.db.eventCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
