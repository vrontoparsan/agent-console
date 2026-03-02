import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { composeEmailReply } from "@/lib/claude";

/**
 * Execute an email reply action: compose with AI, send via SMTP, update action status.
 */
export async function executeEmailReply(eventId: string, actionId: string): Promise<void> {
  // Load event with all context
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      category: true,
      emailAccount: true,
      messages: { orderBy: { createdAt: "asc" }, take: 20 },
      actions: { where: { id: actionId } },
    },
  });

  if (!event) throw new Error("Event not found");
  if (!event.emailAccount) throw new Error("Event has no email account");
  if (!event.senderEmail) throw new Error("Event has no sender email");

  const account = event.emailAccount;
  if (!account.smtpHost || !account.smtpUser || !account.smtpPassword) {
    throw new Error(`SMTP not configured for email account "${account.label}"`);
  }

  const action = event.actions[0];
  if (!action) throw new Error("Action not found");

  // Set action to IN_PROGRESS
  await prisma.eventAction.update({
    where: { id: actionId },
    data: { status: "IN_PROGRESS" },
  });

  try {
    // Load company info and email settings
    const company = await prisma.companyInfo.findUnique({ where: { id: "default" } });
    const extra = (company?.extra as Record<string, unknown>) || {};
    const emailSettings = (extra.emailSettings as {
      tone?: string;
      signature?: string;
    }) || {};

    // Build company info string
    const companyParts: string[] = [];
    if (company?.name) companyParts.push(company.name);
    if (company?.email) companyParts.push(company.email);
    if (company?.phone) companyParts.push(company.phone);
    const companyInfo = companyParts.join(", ");

    // Build chat history string
    const chatHistory = event.messages.length > 0
      ? event.messages
          .map((m) => `[${m.role}]: ${m.content.slice(0, 500)}`)
          .join("\n")
      : undefined;

    // Process signature template
    let signature = emailSettings.signature || "";
    if (signature && company) {
      signature = signature
        .replace(/\{companyName\}/g, company.name || "")
        .replace(/\{email\}/g, company.email || "")
        .replace(/\{phone\}/g, company.phone || "")
        .replace(/\{web\}/g, company.web || "");
    }

    // Compose reply via Claude
    const replyBody = await composeEmailReply({
      eventTitle: event.title,
      eventContent: event.rawContent || event.summary || "",
      senderName: event.senderName || undefined,
      senderEmail: event.senderEmail,
      chatHistory,
      categoryContext: event.category?.contextMd || undefined,
      companyInfo: companyInfo || undefined,
      toneInstructions: emailSettings.tone || undefined,
      signature: signature || undefined,
      actionDescription: action.description || action.title,
    });

    // Send via SMTP
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort || 587,
      secure: account.smtpTls && (account.smtpPort === 465),
      auth: {
        user: account.smtpUser,
        pass: account.smtpPassword,
      },
      tls: account.smtpTls ? { rejectUnauthorized: false } : undefined,
    });

    const metadata = (event.metadata as Record<string, unknown>) || {};

    await transporter.sendMail({
      from: `"${company?.name || account.label}" <${account.email}>`,
      to: event.senderEmail,
      subject: `Re: ${event.title}`,
      text: replyBody,
      inReplyTo: (metadata.messageId as string) || undefined,
      references: Array.isArray(metadata.references)
        ? (metadata.references as string[]).join(" ")
        : (metadata.messageId as string) || undefined,
    });

    // Update action as completed
    await prisma.eventAction.update({
      where: { id: actionId },
      data: {
        status: "COMPLETED",
        executedAt: new Date(),
        result: `Email sent to ${event.senderEmail}`,
      },
    });

    // Save sent reply as message for audit trail
    await prisma.message.create({
      data: {
        content: `[Email sent to ${event.senderEmail}]\n\n${replyBody}`,
        role: "assistant",
        eventId: event.id,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Revert action to SUGGESTED so user can retry
    await prisma.eventAction.update({
      where: { id: actionId },
      data: {
        status: "SUGGESTED",
        result: `Failed: ${errorMsg}`,
      },
    });

    throw err;
  }
}
