// In-memory registry of active UI Agent tasks.
// Survives hot-reloads via globalThis (same pattern as lib/prisma.ts).
// Used to distinguish "still running" from "stuck after restart".

const globalForTasks = globalThis as unknown as {
  activeTasks: Map<string, { startedAt: number }>;
};

if (!globalForTasks.activeTasks) {
  globalForTasks.activeTasks = new Map();
}

export const activeTasks = globalForTasks.activeTasks;
