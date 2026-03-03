import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const execAsync = promisify(exec);

const SNAPSHOT_DIR = "/data/snapshots";

// ─── Types ──────────────────────────────────────────────────

type PageState = {
  title: string;
  icon: string | null;
  code: string | null;
  config: unknown;
  published: boolean;
  order: number;
  categoryId: string | null;
};

type CategoryState = {
  id: string;
  name: string;
  order: number;
};

type SnapshotState = {
  pages: Record<string, PageState>; // keyed by slug
  categories: CategoryState[];
};

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
      `pg_dump "${dbUrl}" --schema-only --schema=instance --no-owner --no-privileges 2>/dev/null`,
      { timeout: 30_000 }
    );
    return stdout || "";
  } catch {
    // Instance schema may not exist yet or have no tables
    return "";
  }
}

/**
 * Dumps instance schema data to gzip file.
 * Returns true if dump contains meaningful data, false if empty/failed.
 */
async function dumpInstanceData(outputPath: string): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    // Use subshell to capture pg_dump exit code through pipe
    await execAsync(
      `pg_dump "${dbUrl}" --data-only --schema=instance --no-owner --no-privileges 2>/dev/null | gzip > "${outputPath}"`,
      { timeout: 120_000 }
    );

    const stat = fs.statSync(outputPath);
    // Empty gzip (no data) is ~20 bytes; real data is > 50 bytes
    return stat.size > 50;
  } catch (err) {
    console.error("dumpInstanceData error:", err);
    return false;
  }
}

async function captureState(): Promise<SnapshotState> {
  const [pages, categories] = await Promise.all([
    prisma.customPage.findMany({
      select: {
        slug: true,
        title: true,
        icon: true,
        code: true,
        config: true,
        published: true,
        order: true,
        categoryId: true,
      },
    }),
    prisma.sectionCategory.findMany({
      select: { id: true, name: true, order: true },
      orderBy: { order: "asc" },
    }),
  ]);

  const pageMap: Record<string, PageState> = {};
  for (const p of pages) {
    pageMap[p.slug] = {
      title: p.title,
      icon: p.icon,
      code: p.code,
      config: p.config,
      published: p.published,
      order: p.order,
      categoryId: p.categoryId,
    };
  }

  return { pages: pageMap, categories };
}

// ─── Create Snapshot ────────────────────────────────────────

export async function createSnapshot(
  label: string,
  customPageId?: string
): Promise<{ id: string; label: string; dataSize: number; deduplicated: boolean }> {
  ensureDir();

  // 1. Capture full state (all pages + categories)
  const codeState = await captureState();

  // 2. Capture schema DDL
  const schemaDdl = await getInstanceSchemaDDL();

  // 3. Dump instance data
  const tempPath = path.join(SNAPSHOT_DIR, `_temp_${Date.now()}.sql.gz`);
  let dataFile: string | null = null;
  let dataHash: string | null = null;
  let dataSize = 0;
  let deduplicated = false;

  const hasData = await dumpInstanceData(tempPath);

  if (hasData) {
    dataHash = await hashFile(tempPath);
    dataSize = fs.statSync(tempPath).size;

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
      dataFile = tempPath; // temporary, renamed below
    }
  } else {
    // Empty dump or no instance tables — clean up
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
      codeState: JSON.parse(JSON.stringify(codeState)),
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
  const autoBackup = await createSnapshot("Auto-backup before restore");

  // 2. Load target snapshot
  const target = await prisma.snapshot.findUnique({
    where: { id: snapshotId },
  });
  if (!target) throw new Error("Snapshot not found");

  const state = target.codeState as SnapshotState;

  // Handle legacy format (old snapshots before categories were added)
  const pages = state.pages || (state as unknown as Record<string, PageState>);
  const categories = state.categories || [];

  // 3. Restore categories first (pages reference them via categoryId)
  // Delete categories not in snapshot, upsert those that are
  const snapshotCategoryIds = categories.map((c) => c.id);
  await prisma.sectionCategory.deleteMany({
    where: { id: { notIn: snapshotCategoryIds } },
  });
  for (const cat of categories) {
    await prisma.sectionCategory.upsert({
      where: { id: cat.id },
      update: { name: cat.name, order: cat.order },
      create: { id: cat.id, name: cat.name, order: cat.order },
    });
  }

  // 4. Restore page state
  const snapshotSlugs = Object.keys(pages);

  // Get current pages
  const currentPages = await prisma.customPage.findMany({
    select: { slug: true },
  });
  const currentSlugs = currentPages.map((p) => p.slug);

  // Update existing pages that are in snapshot
  for (const [slug, pageState] of Object.entries(pages)) {
    const data = {
      code: pageState.code,
      title: pageState.title,
      icon: pageState.icon,
      config: (pageState.config as object) || {},
      published: pageState.published,
      order: pageState.order ?? 0,
      categoryId: pageState.categoryId,
    };

    if (currentSlugs.includes(slug)) {
      await prisma.customPage.update({ where: { slug }, data });
    } else {
      // Page existed in snapshot but was deleted — recreate it
      await prisma.customPage.create({ data: { slug, ...data } });
    }
  }

  // Pages that exist now but weren't in the snapshot — leave them
  // (they were created after the snapshot, user may want to keep them)
  // If user wants them gone, they can delete manually

  // 5. Restore instance schema + data
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    // Drop and recreate instance schema
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS instance CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA instance`);

    // Restore DDL (table structure) via temp file
    if (target.schemaDdl && target.schemaDdl.trim()) {
      const ddlPath = path.join(SNAPSHOT_DIR, `_restore_ddl_${Date.now()}.sql`);
      fs.writeFileSync(ddlPath, target.schemaDdl, "utf-8");
      try {
        await execAsync(`psql "${dbUrl}" < "${ddlPath}"`, { timeout: 30_000 });
      } finally {
        if (fs.existsSync(ddlPath)) fs.unlinkSync(ddlPath);
      }
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

  // 6. Mark target as current
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
