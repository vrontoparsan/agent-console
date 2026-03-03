import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { restoreSnapshot } from "@/lib/snapshots";

// POST: Restore to a specific snapshot
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await restoreSnapshot(id, ctx.tenantId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Restore failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
