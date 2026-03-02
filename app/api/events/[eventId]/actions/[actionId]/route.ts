import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeEmailReply } from "@/lib/email/email-reply";

const EMAIL_ACTION_KEYWORDS = [
  "reply", "email", "respond", "odpovedat", "odpovedať", "odpisat", "odpísať",
  "mail", "napísat", "napisat", "poslat", "odoslat",
];

function isEmailAction(title: string): boolean {
  const lower = title.toLowerCase();
  return EMAIL_ACTION_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; actionId: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, actionId } = await params;
  const body = await req.json();
  const { status } = body;

  if (!["APPROVED", "REJECTED", "COMPLETED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // For APPROVED email actions, try to execute the reply
  if (status === "APPROVED") {
    const action = await prisma.eventAction.findUnique({
      where: { id: actionId },
      include: {
        event: {
          select: { emailAccountId: true, senderEmail: true, emailAccount: { select: { smtpHost: true } } },
        },
      },
    });

    if (
      action &&
      isEmailAction(action.title) &&
      action.event.emailAccountId &&
      action.event.senderEmail &&
      action.event.emailAccount?.smtpHost
    ) {
      // Execute email reply in background
      executeEmailReply(eventId, actionId).catch((err) => {
        console.error(`[Email Reply] Failed for action ${actionId}:`, err);
      });

      // Return immediately — action is now IN_PROGRESS
      const updated = await prisma.eventAction.findUnique({ where: { id: actionId } });
      return NextResponse.json(updated);
    }
  }

  // Default: just update status
  const action = await prisma.eventAction.update({
    where: { id: actionId },
    data: {
      status,
      executedAt: status === "COMPLETED" ? new Date() : undefined,
    },
  });

  return NextResponse.json(action);
}
