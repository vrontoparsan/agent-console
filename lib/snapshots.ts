import { prisma } from "@/lib/prisma";
import { tenantPrisma, getTenantSchema } from "@/lib/prisma-tenant";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const execAsync = promisify(exec);

function getSnapshotDir(tenantId: string): string {
  return `/data/tenants/${tenantId}/snapshots`;
}

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

function ensureDir(tenantId: string) {
  fs.mkdirSync(getSnapshotDir(tenantId), { recursive: true });
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

async function getTenantSchemaDDL(tenantSchema: string): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    const { stdout } = await execAsync(
      `pg_dump "${dbUrl}" --schema-only --schema="${tenantSchema}" --no-owner --no-privileges 2>/dev/null`,
      { timeout: 30_000 }
    );
    return stdout || "";
  } catch {
    // Tenant schema may not exist yet or have no tables
    return "";
  }
}

/**
 * Dumps tenant schema data to gzip file.
 * Returns true if dump contains meaningful data, false if empty/failed.
 */
async function dumpTenantData(outputPath: string, tenantSchema: string): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    await execAsync(
      `pg_dump "${dbUrl}" --data-only --schema="${tenantSchema}" --no-owner --no-privileges 2>/dev/null | gzip > "${outputPath}"`,
      { timeout: 120_000 }
    );

    const stat = fs.statSync(outputPath);
    // Empty gzip (no data) is ~20 bytes; real data is > 50 bytes
    return stat.size > 50;
  } catch (err) {
    console.error("dumpTenantData error:", err);
    return false;
  }
}

async function captureState(tenantId: string): Promise<SnapshotState> {
  const db = tenantPrisma(tenantId);
  const [pages, categories] = await Promise.all([
    db.customPage.findMany({
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
    db.sectionCategory.findMany({
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
  tenantId: string,
  customPageId?: string
): Promise<{ id: string; label: string; dataSize: number; deduplicated: boolean }> {
  const snapshotDir = getSnapshotDir(tenantId);
  const tenantSchema = getTenantSchema(tenantId);
  const db = tenantPrisma(tenantId);
  ensureDir(tenantId);

  // 1. Capture full state (all pages + categories)
  const codeState = await captureState(tenantId);

  // 2. Capture schema DDL
  const schemaDdl = await getTenantSchemaDDL(tenantSchema);

  // 3. Dump tenant data
  const tempPath = path.join(snapshotDir, `_temp_${Date.now()}.sql.gz`);
  let dataFile: string | null = null;
  let dataHash: string | null = null;
  let dataSize = 0;
  let deduplicated = false;

  const hasData = await dumpTenantData(tempPath, tenantSchema);

  if (hasData) {
    dataHash = await hashFile(tempPath);
    dataSize = fs.statSync(tempPath).size;

    // Check for dedup — does an existing snapshot have the same data?
    const existing = await db.snapshot.findFirst({
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
    // Empty dump or no tenant tables — clean up
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }

  // 4. Find current snapshot for parentId
  const current = await db.snapshot.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  // 5. Create snapshot record
  const snapshot = await db.snapshot.create({
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
    const finalPath = path.join(snapshotDir, `${snapshot.id}.sql.gz`);
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
  snapshotId: string,
  tenantId: string
): Promise<{ ok: true; autoBackupId: string }> {
  const tenantSchema = getTenantSchema(tenantId);
  const snapshotDir = getSnapshotDir(tenantId);
  const db = tenantPrisma(tenantId);

  // 1. Safety: create auto-backup of current state
  const autoBackup = await createSnapshot("Auto-backup before restore", tenantId);

  // 2. Load target snapshot
  const target = await db.snapshot.findFirst({
    where: { id: snapshotId },
  });
  if (!target) throw new Error("Snapshot not found");

  const state = target.codeState as SnapshotState;

  // Handle legacy format (old snapshots before categories were added)
  const pages = state.pages || (state as unknown as Record<string, PageState>);
  const categories = state.categories || [];

  // 3. Restore categories first (pages reference them via categoryId)
  const snapshotCategoryIds = categories.map((c) => c.id);
  await db.sectionCategory.deleteMany({
    where: { id: { notIn: snapshotCategoryIds } },
  });
  for (const cat of categories) {
    await db.sectionCategory.upsert({
      where: { id: cat.id },
      update: { name: cat.name, order: cat.order },
      create: { id: cat.id, name: cat.name, order: cat.order },
    });
  }

  // 4. Restore page state
  // Get current pages for this tenant
  const currentPages = await db.customPage.findMany({
    select: { slug: true },
  });
  const currentSlugs = currentPages.map((p) => p.slug);

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
      // Use findFirst since slug is not globally unique
      const page = await db.customPage.findFirst({ where: { slug }, select: { id: true } });
      if (page) {
        await db.customPage.update({ where: { id: page.id }, data });
      }
    } else {
      await db.customPage.create({ data: { slug, ...data } });
    }
  }

  // 5. Restore tenant schema + data
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");

  try {
    // Drop and recreate tenant schema
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${tenantSchema}" CASCADE`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${tenantSchema}"`);

    // Restore DDL (table structure) via temp file
    if (target.schemaDdl && target.schemaDdl.trim()) {
      const ddlPath = path.join(snapshotDir, `_restore_ddl_${Date.now()}.sql`);
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

  // 6. Mark target as current (within this tenant's snapshots)
  await db.snapshot.updateMany({
    where: { isCurrent: true },
    data: { isCurrent: false },
  });
  await prisma.snapshot.update({
    where: { id: snapshotId },
    data: { isCurrent: true },
  });

  return { ok: true, autoBackupId: autoBackup.id };
}
