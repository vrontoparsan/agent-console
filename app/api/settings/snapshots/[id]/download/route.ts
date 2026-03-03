import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import * as fs from "fs";

// GET: Download snapshot data file (ADMIN only)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const snapshot = await ctx.db.snapshot.findUnique({
    where: { id },
    select: { id: true, label: true, dataFile: true, createdAt: true },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  if (!snapshot.dataFile || !fs.existsSync(snapshot.dataFile)) {
    return NextResponse.json({ error: "No data file for this snapshot" }, { status: 404 });
  }

  const stat = fs.statSync(snapshot.dataFile);
  const fileBuffer = fs.readFileSync(snapshot.dataFile);

  const timestamp = snapshot.createdAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `snapshot-${timestamp}.sql.gz`;

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(stat.size),
    },
  });
}
