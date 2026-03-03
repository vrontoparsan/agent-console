import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { restoreSnapshot } from "@/lib/snapshots";

// POST: Restore to a specific snapshot
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const result = await restoreSnapshot(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Restore failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
