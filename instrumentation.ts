export async function register() {
  // Only start IMAP polling on the Node.js server (not Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPolling } = await import("./lib/email/poll-scheduler");
    startPolling();
  }
}
