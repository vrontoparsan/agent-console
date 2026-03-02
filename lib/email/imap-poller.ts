import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { prisma } from "@/lib/prisma";
import { classifyAndSummarizeEmail, generateActions } from "@/lib/claude";

type EmailAccountRecord = {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  enabled: boolean;
};

/**
 * Poll a single IMAP account for unseen messages and create Events.
 */
export async function pollAccount(account: EmailAccountRecord): Promise<number> {
  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapTls,
    auth: {
      user: account.imapUser,
      pass: account.imapPassword,
    },
    logger: false,
  });

  let created = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for unseen messages
      const uids = await client.search({ seen: false }, { uid: true });

      if (!uids || uids.length === 0) {
        return 0;
      }

      // Load categories for classification
      const categories = await prisma.eventCategory.findMany({
        select: { id: true, name: true, contextMd: true },
      });

      for (const uid of uids) {
        try {
          // Fetch full message
          const message = await client.fetchOne(String(uid), {
            source: true,
            uid: true,
          });

          if (message === false || !message.source) continue;

          // Parse email
          const parsed: ParsedMail = await simpleParser(message.source);

          const messageId = parsed.messageId || "";
          const subject = parsed.subject || "(No subject)";
          const fromAddr = parsed.from?.value?.[0];
          const textBody = parsed.text || "";
          const htmlBody = parsed.html || "";

          // Check for duplicate by messageId
          if (messageId) {
            const existing = await prisma.$queryRaw<{ count: bigint }[]>`
              SELECT COUNT(*) as count FROM "Event"
              WHERE metadata->>'messageId' = ${messageId}
            `;
            if (existing[0] && Number(existing[0].count) > 0) {
              // Already processed — just mark seen
              await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
              continue;
            }
          }

          // Classify email with AI
          const classification = await classifyAndSummarizeEmail(
            subject,
            textBody || htmlBody.replace(/<[^>]+>/g, " ").slice(0, 3000),
            categories
          );

          // Create Event
          const event = await prisma.event.create({
            data: {
              title: subject.slice(0, 200),
              summary: classification.summary,
              rawContent: textBody || htmlBody,
              source: "email",
              type: classification.type,
              priority: 0,
              categoryId: classification.categoryId,
              emailAccountId: account.id,
              senderEmail: fromAddr?.address || null,
              senderName: fromAddr?.name || null,
              metadata: {
                messageId,
                inReplyTo: parsed.inReplyTo || null,
                references: Array.isArray(parsed.references)
                  ? parsed.references
                  : parsed.references
                    ? [parsed.references]
                    : [],
                date: parsed.date?.toISOString() || null,
                to: Array.isArray(parsed.to) ? parsed.to.map((a) => a.text).join(", ") : parsed.to?.text || null,
                cc: Array.isArray(parsed.cc) ? parsed.cc.map((a) => a.text).join(", ") : parsed.cc?.text || null,
              },
            },
            include: { category: true },
          });

          // Generate AI actions
          try {
            const actions = await generateActions(
              subject,
              textBody || classification.summary,
              event.category?.contextMd || undefined
            );
            if (Array.isArray(actions) && actions.length > 0) {
              await prisma.eventAction.createMany({
                data: actions.map((a: { title: string; description?: string }) => ({
                  eventId: event.id,
                  title: a.title,
                  description: a.description || null,
                  aiSuggested: true,
                })),
              });
            }
          } catch {
            // AI actions are best-effort
          }

          // Mark as seen
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          created++;
        } catch (err) {
          console.error(`[IMAP] Error processing message uid=${uid} for ${account.label}:`, err);
        }
      }
    } finally {
      lock.release();
    }

    // Update polling state
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastPolledAt: new Date(), lastError: null },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[IMAP] Poll error for ${account.label}:`, errorMsg);

    // Record error
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastPolledAt: new Date(), lastError: errorMsg },
    }).catch(() => {});

    throw err;
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }

  return created;
}
