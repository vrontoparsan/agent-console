import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json(null, { status: 401 });

  const info = await prisma.companyInfo.findUnique({ where: { id: "default" } });
  return NextResponse.json(info);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["SUPERADMIN", "ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const info = await prisma.companyInfo.upsert({
    where: { id: "default" },
    update: body,
    create: { id: "default", ...body },
  });

  return NextResponse.json(info);
}
