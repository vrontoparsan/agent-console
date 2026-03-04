import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import * as fs from "fs";
import * as path from "path";

export async function GET(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name || !name.startsWith("backup-")) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
  }

  // Prevent path traversal
  const safeName = path.basename(name);
  const backupDir = `/data/tenants/${ctx.tenantId}/backups`;
  const filepath = path.join(backupDir, safeName);

  if (!fs.existsSync(filepath)) {
    return NextResponse.json({ error: "Backup not found" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filepath);
  const stat = fs.statSync(filepath);

  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(stat.size),
    },
  });
}
