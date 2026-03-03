import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { companyName, email, password } = await req.json();

  // Validate inputs
  if (!companyName || typeof companyName !== "string" || companyName.trim().length < 2) {
    return NextResponse.json({ error: "Company name is required (min 2 characters)" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Generate slug from company name
  const baseSlug = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Ensure slug uniqueness
  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (!existing) break;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }

  // Check if email already exists
  const existingUser = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    // Create tenant + admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          name: companyName.trim(),
          slug,
          companyName: companyName.trim(),
        },
      });

      // 2. Create admin user
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name: companyName.trim(),
          password: hashedPassword,
          role: "ADMIN",
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    // 3. Create tenant PostgreSQL schema
    const tenantSchema = `tenant_${result.tenant.id}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${tenantSchema}"`);

    // 4. Seed default agent contexts for the new tenant
    const { tenantPrisma } = await import("@/lib/prisma-tenant");
    const db = tenantPrisma(result.tenant.id);
    await db.agentContext.createMany({
      data: [
        {
          name: "Company Info",
          content: `Company: ${companyName.trim()}`,
          type: "PERMANENT",
          enabled: true,
          order: 0,
        },
      ],
    });

    return NextResponse.json(
      { ok: true, tenantId: result.tenant.id, slug: result.tenant.slug },
      { status: 201 }
    );
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }
}
