import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "secret");

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId } = await req.json();
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  // Find the tenant's ADMIN user
  const adminUser = await prisma.user.findFirst({
    where: { tenantId, role: "ADMIN" },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });

  if (!adminUser) {
    return NextResponse.json({ error: "No admin user found for this tenant" }, { status: 404 });
  }

  // Create a short-lived signed token
  const token = await new SignJWT({
    userId: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    role: adminUser.role,
    tenantId: adminUser.tenantId,
    impersonatedBy: session.user.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("60s")
    .sign(secret);

  return NextResponse.json({
    url: `/api/auth/impersonate-callback?token=${token}`,
  });
}
