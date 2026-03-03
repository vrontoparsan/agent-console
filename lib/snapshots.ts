import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const execAsync = promisify(exec);

const SNAPSHOT_DIR = "/data/snapshots";

// ─── Helpers ────────────────────────────────────────────────

function ensureDir() {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

async function hashFile(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filepath);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function getInstanceSchemaDDL(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    const { stdout } = await execAsync(
      `pg_dump "${dbUrl}" --schema-only --schema=instance --no-owner --no-privileges`,
      { timeout: 30_000 }
    );
    return stdout;
  } catch {
    // Instance schema may not exist yet or have no tables
    return "";
  }
}

async function dumpInstanceData(outputPath: string): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  await execAsync(
    `pg_dump "${dbUrl}" --data-only --schema=instance --no-owner --no-privileges | gzip > "${outputPath}"`,
    { timeout: 120_000 }
  );
}

async function getCapturedCodeState(): Promise<Record<string, { title: string; icon: string | null; code: string | null; published: boolean }>> {
  const pages = await prisma.customPage.findMany({
    select: { slug: true, title: true, icon: true, code: true, published: true },
  });

  const state: Record<string, { title: string; icon: string | null; code: string | null; published: boolean }> = {};
  for (const p of pages) {
    state[p.slug] = {
      title: p.title,
      icon: p.icon,
      code: p.code,
      published: p.published,
    };
  }
  return state;
}

// ─── Create Snapshot ────────────────────────────────────────

export async function createSnapshot(
  label: string,
  customPageId?: string
): Promise<{ id: string; label: string; dataSize: number; deduplicated: boolean }> {
  ensureDir();

  // 1. Capture code state
  const codeState = await getCapturedCodeState();

  // 2. Capture schema DDL
  const schemaDdl = await getInstanceSchemaDDL();

  // 3. Dump instance data
  const tempPath = path.join(SNAPSHOT_DIR, `_temp_${Date.now()}.sql.gz`);
  let dataFile: string | null = null;
  let dataHash: string | null = null;
  let dataSize = 0;
  let deduplicated = false;

  try {
    await dumpInstanceData(tempPath);

    // Check if the dump has any meaningful data (gzip of empty is ~20 bytes)
    const stat = fs.statSync(tempPath);
    if (stat.size > 50) {
      dataHash = await hashFile(tempPath);
      dataSize = stat.size;

      // Check for dedup — does an existing snapshot have the same data?
      const existing = await prisma.snapshot.findFirst({
        where: { dataHash },
        select: { dataFile: true },
      });

      if (existing?.dataFile && fs.existsSync(existing.dataFile)) {
        // Reuse existing file
        dataFile = existing.dataFile;
        deduplicated = true;
        fs.unlinkSync(tempPath);
      } else {
        // Keep the new file — will rename after we have the snapshot ID
        dataFile = tempPath; // temporary, renamed below
      }
    } else {
      // Empty dump, no instance tables yet
      fs.unlinkSync(tempPath);
    }
  } catch {
    // Instance schema might not exist or be empty
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }

  // 4. Find current snapshot for parentId
  const current = await prisma.snapshot.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  // 5. Create snapshot record
  const snapshot = await prisma.snapshot.create({
    data: {
      label,
      parentId: current?.id || null,
      customPageId: customPageId || null,
      codeState,
      schemaDdl,
      dataFile: null, // set after rename
      dataHash,
      dataSize,
      isCurrent: true,
    },
  });

  // Rename temp file to final path using snapshot ID
  if (dataFile && !deduplicated) {
    const finalPath = path.join(SNAPSHOT_DIR, `${snapshot.id}.sql.gz`);
    fs.renameSync(dataFile, finalPath);
    dataFile = finalPath;
  }

  // Update snapshot with final dataFile path
  if (dataFile) {
    await prisma.snapshot.update({
      where: { id: snapshot.id },
      data: { dataFile },
    });
  }

  // Unmark previous current
  if (current) {
    await prisma.snapshot.update({
      where: { id: current.id },
      data: { isCurrent: false },
    });
  }

  return { id: snapshot.id, label: snapshot.label, dataSize, deduplicated };
}

// ─── Restore Snapshot ───────────────────────────────────────

export async function restoreSnapshot(
  snapshotId: string
): Promise<{ ok: true; autoBackupId: string }> {
  // 1. Safety: create auto-backup of current state
  const autoBackup = await createSnapshot(`Auto-backup before restore`);

  // 2. Load target snapshot
  const target = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
  });
  if (!target) throw new Error("Snapshot not found");

  const codeState = target.codeState as Record<
    string,
    { title: string; icon: string | null; code: string | null; published: boolean }
  >;

  // 3. Restore code state
  for (const [slug, state] of Object.entries(codeState)) {
    try {
      await prisma.customPage.update({
        where: { slug },
        data: {
          code: state.code,
          title: state.title,
          icon: state.icon,
          published: state.published,
        },
      });
    } catch {
      // Page may have been deleted since snapshot — skip
    }
  }

  // 4. Restore instance schema + data
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    // Drop and recreate instance schema
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS instance CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA instance`);

    // Restore DDL (table structure)
    if (target.schemaDdl && target.schemaDdl.trim()) {
      // Execute the DDL via psql
      await execAsync(
        `echo ${JSON.stringify(target.schemaDdl)} | psql "${dbUrl}"`,
        { timeout: 30_000 }
      );
    }

    // Restore data from dump file
    if (target.dataFile && fs.existsSync(target.dataFile)) {
      await execAsync(
        `zcat "${target.dataFile}" | psql "${dbUrl}"`,
        { timeout: 120_000 }
      );
    }
  } catch (err) {
    console.error("Snapshot restore DB error:", err);
    throw new Error(
      `Database restore failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 5. Mark target as current
  // First unmark all
  await prisma.snapshot.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });
  await prisma.snapshot.update({
    where: { id: snapshotId },
    data: { isCurrent: true },
  });

  return { ok: true, autoBackupId: autoBackup.id };
}
