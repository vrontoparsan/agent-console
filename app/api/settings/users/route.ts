import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { hash } from "bcryptjs";

export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json([], { status: 403 });
  }

  const users = await ctx.db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      categoryAccess: { select: { categoryId: true } },
      emailAccountAccess: { select: { emailAccountId: true } },
      pageAccess: { select: { pageId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  // Flatten access arrays for frontend
  const mapped = users.map((u) => ({
    ...u,
    categoryIds: u.categoryAccess.map((a) => a.categoryId),
    emailAccountIds: u.emailAccountAccess.map((a) => a.emailAccountId),
    pageIds: u.pageAccess.map((a) => a.pageId),
    categoryAccess: undefined,
    emailAccountAccess: undefined,
    pageAccess: undefined,
  }));
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, name, password, role, categoryIds, emailAccountIds, pageIds } = await req.json();
  if (!email || !name || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const hashed = await hash(password, 12);
  const user = await ctx.db.user.create({
    data: {
      email,
      name,
      password: hashed,
      role: role || "MANAGER",
      categoryAccess: categoryIds?.length
        ? { create: categoryIds.map((cid: string) => ({ categoryId: cid })) }
        : undefined,
      emailAccountAccess: emailAccountIds?.length
        ? { create: emailAccountIds.map((eid: string) => ({ emailAccountId: eid })) }
        : undefined,
      pageAccess: pageIds?.length
        ? { create: pageIds.map((pid: string) => ({ pageId: pid })) }
        : undefined,
    },
    select: { id: true, email: true, name: true, role: true },
  });
  return NextResponse.json(user, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, email, name, password, role, categoryIds, emailAccountIds, pageIds } = await req.json();
  const data: Record<string, unknown> = { email, name, role };
  if (password) data.password = await hash(password, 12);

  // Sync access in a transaction
  const user = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true },
    });

    // Sync category access
    if (categoryIds !== undefined) {
      await tx.userCategoryAccess.deleteMany({ where: { userId: id } });
      if (categoryIds.length > 0) {
        await tx.userCategoryAccess.createMany({
          data: categoryIds.map((cid: string) => ({ userId: id, categoryId: cid })),
        });
      }
    }

    // Sync email account access
    if (emailAccountIds !== undefined) {
      await tx.userEmailAccountAccess.deleteMany({ where: { userId: id } });
      if (emailAccountIds.length > 0) {
        await tx.userEmailAccountAccess.createMany({
          data: emailAccountIds.map((eid: string) => ({ userId: id, emailAccountId: eid })),
        });
      }
    }

    // Sync page access
    if (pageIds !== undefined) {
      await tx.userPageAccess.deleteMany({ where: { userId: id } });
      if (pageIds.length > 0) {
        await tx.userPageAccess.createMany({
          data: pageIds.map((pid: string) => ({ userId: id, pageId: pid })),
        });
      }
    }

    return updated;
  });
  return NextResponse.json(user);
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (id === ctx.session.user.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await ctx.db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
