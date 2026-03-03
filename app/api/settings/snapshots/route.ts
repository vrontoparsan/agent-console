import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { createSnapshot } from "@/lib/snapshots";

// GET: List snapshots with pagination (ADMIN)
export async function GET(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") || "50");
  const skip = (page - 1) * pageSize;

  const [snapshots, total] = await Promise.all([
    ctx.db.snapshot.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        label: true,
        parentId: true,
        customPageId: true,
        dataSize: true,
        dataFile: true,
        isCurrent: true,
        createdAt: true,
        customPage: { select: { title: true, slug: true } },
      },
    }),
    ctx.db.snapshot.count(),
  ]);

  return NextResponse.json({ snapshots, total, role: ctx.role });
}

// POST: Create manual snapshot (ADMIN)
export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
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
