import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MASK = "***";

function maskPasswords(account: Record<string, unknown>) {
  return {
    ...account,
    imapPassword: MASK,
    smtpPassword: account.smtpPassword ? MASK : null,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json([], { status: 403 });
  }

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(accounts.map((a) => maskPasswords(a as unknown as Record<string, unknown>)));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const account = await prisma.emailAccount.create({
    data: {
      label: body.label,
      email: body.email,
      imapHost: body.imapHost,
      imapPort: body.imapPort ?? 993,
      imapUser: body.imapUser,
      imapPassword: body.imapPassword,
      imapTls: body.imapTls ?? true,
      smtpHost: body.smtpHost || null,
      smtpPort: body.smtpPort || null,
      smtpUser: body.smtpUser || null,
      smtpPassword: body.smtpPassword || null,
      smtpTls: body.smtpTls ?? true,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json(maskPasswords(account as unknown as Record<string, unknown>), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // If password is masked, preserve the existing value
  const existing = await prisma.emailAccount.findUnique({ where: { id: body.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const account = await prisma.emailAccount.update({
    where: { id: body.id },
    data: {
      label: body.label,
      email: body.email,
      imapHost: body.imapHost,
      imapPort: body.imapPort ?? 993,
      imapUser: body.imapUser,
      imapPassword: body.imapPassword === MASK ? existing.imapPassword : body.imapPassword,
      imapTls: body.imapTls ?? true,
      smtpHost: body.smtpHost || null,
      smtpPort: body.smtpPort || null,
      smtpUser: body.smtpUser || null,
      smtpPassword: body.smtpPassword === MASK ? existing.smtpPassword : (body.smtpPassword || null),
      smtpTls: body.smtpTls ?? true,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json(maskPasswords(account as unknown as Record<string, unknown>));
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.emailAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
