import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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
        .filter((f) => f.endsWith(".sql.gz") || f.endsWith(".sql"))
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

// POST: Trigger backup now
export async function POST(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const backupDir = getBackupDir(ctx.tenantId);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${timestamp}.sql.gz`;
  const filepath = path.join(backupDir, filename);

  try {
    // Ensure backup directory exists
    fs.mkdirSync(backupDir, { recursive: true });

    // Run pg_dump with gzip
    await execAsync(`pg_dump "${dbUrl}" | gzip > "${filepath}"`, {
      timeout: 120000,
    });

    const stat = fs.statSync(filepath);

    // Clean up old backups
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".sql.gz"))
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
              subject: `Agent Console DB Backup - ${timestamp}`,
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
