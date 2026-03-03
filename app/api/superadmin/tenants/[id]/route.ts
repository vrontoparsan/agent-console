import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return null;
  }
  return session;
}

// GET: Single tenant detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, email: true, name: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      _count: {
        select: { events: true, customPages: true, snapshots: true },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Health & monitoring data
  const [lastEvent, lastMessage, messageCount, snapshotCount, emailAccountCount, cronJobCount] =
    await Promise.all([
      prisma.event.findFirst({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.message.findFirst({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.message.count({ where: { tenantId: id } }),
      prisma.snapshot.count({ where: { tenantId: id } }),
      prisma.emailAccount.count({ where: { tenantId: id } }),
      prisma.cronJob.count({ where: { tenantId: id } }),
    ]);

  const extra = tenant.extra as Record<string, unknown> | null;
  const aiKeys = extra?.aiApiKeys as unknown[] | undefined;
  const hasAiKeys = !!(aiKeys && aiKeys.length > 0);

  const lastActivity = [lastEvent?.createdAt, lastMessage?.createdAt]
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

  return NextResponse.json({
    ...tenant,
    health: {
      lastActivity: lastActivity ? lastActivity.toISOString() : null,
      messageCount,
      snapshotCount,
      emailAccountCount,
      cronJobCount,
      hasAiKeys,
    },
  });
}

// PUT: Update tenant
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const allowedFields = ["name", "companyName", "plan", "active", "ico", "dic", "icDph", "address", "email", "phone", "web", "billingStatus", "billingNote"];
  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  try {
    const updated = await prisma.tenant.update({
      where: { id },
      data,
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// DELETE: Soft-delete (deactivate) tenant
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    await prisma.tenant.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
