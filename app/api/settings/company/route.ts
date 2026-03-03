import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  const info = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  return NextResponse.json(info);
}

export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const info = await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: body,
  });

  return NextResponse.json(info);
}
