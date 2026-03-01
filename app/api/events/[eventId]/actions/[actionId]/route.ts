import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { actionId } = await params;
  const body = await req.json();
  const { status } = body;

  if (!["APPROVED", "REJECTED", "COMPLETED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const action = await prisma.eventAction.update({
    where: { id: actionId },
    data: {
      status,
      executedAt: status === "COMPLETED" ? new Date() : undefined,
    },
  });

  return NextResponse.json(action);
}
