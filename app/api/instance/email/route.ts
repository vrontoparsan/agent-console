import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, body } = await req.json();
  if (!to || !subject || !body) {
    return NextResponse.json(
      { error: "to, subject, and body required" },
      { status: 400 }
    );
  }

  // Find an email account with SMTP configured
  const account = await prisma.emailAccount.findFirst({
    where: { smtpHost: { not: "" } },
  });

  if (!account || !account.smtpHost) {
    return NextResponse.json(
      { error: "No SMTP email account configured" },
      { status: 400 }
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort || 587,
      secure: account.smtpPort === 465,
      auth: {
        user: account.email,
        pass: account.smtpPassword,
      },
    } as nodemailer.TransportOptions);

    await transporter.sendMail({
      from: account.email,
      to,
      subject,
      text: body,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email send failed" },
      { status: 500 }
    );
  }
}
