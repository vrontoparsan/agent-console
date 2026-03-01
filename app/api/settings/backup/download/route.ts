import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

const BACKUP_DIR = "/data/backups";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name || !name.startsWith("backup-")) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
  }

  // Prevent path traversal
  const safeName = path.basename(name);
  const filepath = path.join(BACKUP_DIR, safeName);

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
