import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return null;
  }
  return session;
}

// GET: List all tenants
export async function GET() {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { users: true, events: true, customPages: true },
      },
    },
  });

  return NextResponse.json({ tenants });
}

// POST: Create a new tenant
export async function POST(req: NextRequest) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, companyName, adminEmail, adminPassword, plan } = await req.json();

  if (!name || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: "name, adminEmail, and adminPassword are required" },
      { status: 400 }
    );
  }

  // Generate slug
  const baseSlug = (name as string)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (!existing) break;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: name.trim(),
          slug,
          companyName: (companyName || name).trim(),
          plan: plan || "standard",
        },
      });

      await tx.user.create({
        data: {
          email: (adminEmail as string).toLowerCase(),
          name: name.trim(),
          password: hashedPassword,
          role: "ADMIN",
          tenantId: tenant.id,
        },
      });

      return tenant;
    });

    // Create tenant schema
    const tenantSchema = `tenant_${result.id}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${tenantSchema}"`);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Create tenant error:", err);
    return NextResponse.json(
      { error: "Failed to create tenant" },
      { status: 500 }
    );
  }
}
