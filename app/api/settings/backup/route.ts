import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getTenantSchema } from "@/lib/prisma-tenant";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as nodemailer from "nodemailer";

const execAsync = promisify(exec);

const MAX_BACKUPS = 20; // Keep last 20 backups

type BackupConfig = {
  frequency: "manual" | "daily" | "weekly" | "monthly";
  destination: "volume" | "email" | "both";
  email: string;
  emailAccountId: string;
  lastBackup: string | null;
};

const DEFAULT_CONFIG: BackupConfig = {
  frequency: "manual",
  destination: "volume",
  email: "",
  emailAccountId: "",
  lastBackup: null,
};

function getBackupDir(tenantId: string) {
  return `/data/tenants/${tenantId}/backups`;
}

// GET: Get backup config and list of backups
export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const backupDir = getBackupDir(ctx.tenantId);

  // Get config from Tenant.extra or use defaults
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const extra = (tenant?.extra as Record<string, unknown>) || {};
  const config: BackupConfig = {
    ...DEFAULT_CONFIG,
    ...(extra.backupConfig as Partial<BackupConfig> || {}),
  };

  // List existing backups
  let backups: { name: string; size: number; date: string }[] = [];
  try {
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir)
        .filter((f) => f.endsWith(".sql.gz") || f.endsWith(".sql") || f.endsWith(".json.gz"))
        .sort()
        .reverse();

      backups = files.map((f) => {
        const stat = fs.statSync(path.join(backupDir, f));
        return {
          name: f,
          size: stat.size,
          date: stat.mtime.toISOString(),
        };
      });
    }
  } catch {
    // Backup dir may not exist yet
  }

  return NextResponse.json({ config, backups });
}

// PUT: Update backup config
export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const newConfig = await req.json();

  // Get existing extra
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  const extra = (tenant?.extra as Record<string, unknown>) || {};

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { extra: { ...extra, backupConfig: newConfig } },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Exports all shared-table data for a single tenant as JSON.
 * Excludes sensitive fields (passwords, SMTP credentials).
 */
async function exportTenantData(tenantId: string) {
  const db = await import("@/lib/prisma-tenant").then((m) => m.tenantPrisma(tenantId));

  const [
    tenant,
    users,
    events,
    eventCategories,
    emailAccounts,
    eventActions,
    messages,
    agentContexts,
    sectionCategories,
    customPages,
    cronJobs,
    snapshots,
  ] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    db.user.findMany({
      select: { id: true, email: true, name: true, role: true, tenantId: true, createdAt: true, updatedAt: true },
    }),
    db.event.findMany(),
    db.eventCategory.findMany(),
    db.emailAccount.findMany({
      select: {
        id: true, label: true, email: true,
        imapHost: true, imapPort: true, imapUser: true, imapTls: true,
        smtpHost: true, smtpPort: true, smtpUser: true, smtpTls: true,
        enabled: true, lastPolledAt: true, lastError: true, tenantId: true,
        createdAt: true, updatedAt: true,
      },
    }),
    db.eventAction.findMany(),
    db.message.findMany(),
    db.agentContext.findMany(),
    db.sectionCategory.findMany(),
    db.customPage.findMany(),
    db.cronJob.findMany(),
    db.snapshot.findMany({
      select: {
        id: true, label: true, parentId: true, customPageId: true,
        codeState: true, schemaDdl: true, dataHash: true, dataSize: true,
        isCurrent: true, tenantId: true, createdAt: true,
      },
    }),
  ]);

  // Junction tables — query through user IDs
  const userIds = users.map((u) => u.id);
  const [userCategoryAccess, userEmailAccountAccess, userPageAccess] = await Promise.all([
    prisma.userCategoryAccess.findMany({ where: { userId: { in: userIds } } }),
    prisma.userEmailAccountAccess.findMany({ where: { userId: { in: userIds } } }),
    prisma.userPageAccess.findMany({ where: { userId: { in: userIds } } }),
  ]);

  return {
    tenant,
    users,
    events,
    eventCategories,
    emailAccounts,
    eventActions,
    messages,
    agentContexts,
    sectionCategories,
    customPages,
    cronJobs,
    snapshots,
    userCategoryAccess,
    userEmailAccountAccess,
    userPageAccess,
  };
}

// POST: Trigger backup now
export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const backupDir = getBackupDir(ctx.tenantId);
  const tenantSchema = getTenantSchema(ctx.tenantId);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${timestamp}.json.gz`;
  const filepath = path.join(backupDir, filename);

  try {
    // Ensure backup directory exists
    fs.mkdirSync(backupDir, { recursive: true });

    // 1. Dump tenant custom schema (DDL + data) via pg_dump
    let tenantSchemaSql = "";
    try {
      const { stdout } = await execAsync(
        `pg_dump "${dbUrl}" --schema="${tenantSchema}" --no-owner --no-privileges 2>/dev/null`,
        { timeout: 60_000 }
      );
      tenantSchemaSql = stdout || "";
    } catch {
      // Tenant schema may not exist yet
    }

    // 2. Export shared table data scoped to this tenant
    const sharedData = await exportTenantData(ctx.tenantId);

    // 3. Combine into single JSON structure and gzip
    const backup = {
      version: 2,
      tenantId: ctx.tenantId,
      createdAt: new Date().toISOString(),
      tenantSchema: tenantSchemaSql,
      data: sharedData,
    };

    const tempJson = path.join(backupDir, `_temp_${Date.now()}.json`);
    fs.writeFileSync(tempJson, JSON.stringify(backup), "utf-8");
    await execAsync(`gzip -c "${tempJson}" > "${filepath}"`, { timeout: 30_000 });
    fs.unlinkSync(tempJson);

    const stat = fs.statSync(filepath);

    // Clean up old backups (both old .sql.gz and new .json.gz)
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith("backup-") && (f.endsWith(".sql.gz") || f.endsWith(".json.gz")))
      .sort()
      .reverse();

    for (const f of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(backupDir, f));
    }

    // Update last backup timestamp in config
    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
    const extra = (tenant?.extra as Record<string, unknown>) || {};
    const config = (extra.backupConfig as Partial<BackupConfig>) || {};
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { extra: { ...extra, backupConfig: { ...config, lastBackup: new Date().toISOString() } } },
    });

    // Send email if configured
    const body = await req.clone().json().catch(() => ({}));
    const sendEmail = body.sendEmail;

    if (sendEmail) {
      const emailAccountId = config.emailAccountId;
      const toEmail = config.email;

      if (emailAccountId && toEmail) {
        const account = await ctx.db.emailAccount.findUnique({ where: { id: emailAccountId } });
        if (account && account.smtpHost && account.smtpUser) {
          try {
            const transport = nodemailer.createTransport({
              host: account.smtpHost,
              port: account.smtpPort || 587,
              secure: account.smtpTls,
              auth: {
                user: account.smtpUser,
                pass: account.smtpPassword || "",
              },
            });

            await transport.sendMail({
              from: account.email,
              to: toEmail,
              subject: `Agent Bizi Backup - ${timestamp}`,
              text: `Database backup created at ${new Date().toLocaleString("sk-SK")}.\n\nSize: ${(stat.size / 1024).toFixed(1)} KB`,
              attachments: [
                {
                  filename,
                  path: filepath,
                },
              ],
            });
          } catch (emailErr) {
            console.error("Backup email failed:", emailErr);
            // Don't fail the backup just because email failed
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      backup: { name: filename, size: stat.size, date: new Date().toISOString() },
    });
  } catch (error) {
    console.error("Backup failed:", error);
    return NextResponse.json(
      { error: "Backup failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// DELETE: Delete a backup file
export async function DELETE(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const backupDir = getBackupDir(ctx.tenantId);

  const name = req.nextUrl.searchParams.get("name");
  if (!name || !name.startsWith("backup-")) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
  }

  const filepath = path.join(backupDir, name);
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
