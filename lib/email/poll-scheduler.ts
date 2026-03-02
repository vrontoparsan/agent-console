import { prisma } from "@/lib/prisma";
import { pollAccount } from "./imap-poller";

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

async function pollAllAccounts() {
  if (isPolling) return; // prevent overlapping polls
  isPolling = true;

  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { enabled: true },
    });

    for (const account of accounts) {
      try {
        const created = await pollAccount(account);
        if (created > 0) {
          console.log(`[IMAP] ${account.label}: ${created} new event(s) created`);
        }
      } catch (err) {
        console.error(`[IMAP] Poll failed for ${account.label}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[IMAP] Failed to fetch email accounts:", err);
  } finally {
    isPolling = false;
  }
}

export function startPolling() {
  if (pollingInterval) return;

  console.log("[IMAP] Starting email poller (interval: 2min)");
  pollingInterval = setInterval(pollAllAccounts, POLL_INTERVAL);

  // First poll after 10s delay to let the app fully start
  setTimeout(pollAllAccounts, 10_000);
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[IMAP] Email poller stopped");
  }
}
