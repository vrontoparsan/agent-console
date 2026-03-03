import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSnapshot } from "@/lib/snapshots";

// GET: List snapshots with pagination
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") || "50");
  const skip = (page - 1) * pageSize;

  const [snapshots, total] = await Promise.all([
    prisma.snapshot.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        label: true,
        parentId: true,
        customPageId: true,
        dataSize: true,
        isCurrent: true,
        createdAt: true,
        customPage: { select: { title: true, slug: true } },
      },
    }),
    prisma.snapshot.count(),
  ]);

  return NextResponse.json({ snapshots, total });
}

// POST: Create manual snapshot
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { label } = await req.json();
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  try {
    const snapshot = await createSnapshot(label.trim());
    return NextResponse.json(snapshot, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Snapshot failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
