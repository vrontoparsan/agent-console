import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as nodemailer from "nodemailer";

const execAsync = promisify(exec);

const BACKUP_DIR = "/data/backups";
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

// GET: Get backup config and list of backups
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get config from CompanyInfo.extra or use defaults
  const company = await prisma.companyInfo.findUnique({ where: { id: "default" } });
  const extra = (company?.extra as Record<string, unknown>) || {};
  const config: BackupConfig = {
    ...DEFAULT_CONFIG,
    ...(extra.backupConfig as Partial<BackupConfig> || {}),
  };

  // List existing backups
  let backups: { name: string; size: number; date: string }[] = [];
  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".sql.gz") || f.endsWith(".sql"))
        .sort()
        .reverse();

      backups = files.map((f) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
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
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const newConfig = await req.json();

  // Get existing extra
  const company = await prisma.companyInfo.findUnique({ where: { id: "default" } });
  const extra = (company?.extra as Record<string, unknown>) || {};

  await prisma.companyInfo.upsert({
    where: { id: "default" },
    update: { extra: { ...extra, backupConfig: newConfig } },
    create: { id: "default", extra: { backupConfig: newConfig } },
  });

  return NextResponse.json({ ok: true });
}

// POST: Trigger backup now
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${timestamp}.sql.gz`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    // Ensure backup directory exists
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // Run pg_dump with gzip
    await execAsync(`pg_dump "${dbUrl}" | gzip > "${filepath}"`, {
      timeout: 120000,
    });

    const stat = fs.statSync(filepath);

    // Clean up old backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".sql.gz"))
      .sort()
      .reverse();

    for (const f of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    }

    // Update last backup timestamp in config
    const company = await prisma.companyInfo.findUnique({ where: { id: "default" } });
    const extra = (company?.extra as Record<string, unknown>) || {};
    const config = (extra.backupConfig as Partial<BackupConfig>) || {};
    await prisma.companyInfo.upsert({
      where: { id: "default" },
      update: { extra: { ...extra, backupConfig: { ...config, lastBackup: new Date().toISOString() } } },
      create: { id: "default", extra: { backupConfig: { ...config, lastBackup: new Date().toISOString() } } },
    });

    // Send email if configured
    const body = await req.clone().json().catch(() => ({}));
    const sendEmail = body.sendEmail;

    if (sendEmail) {
      const emailAccountId = config.emailAccountId;
      const toEmail = config.email;

      if (emailAccountId && toEmail) {
        const account = await prisma.emailAccount.findUnique({ where: { id: emailAccountId } });
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
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name || !name.startsWith("backup-")) {
    return NextResponse.json({ error: "Invalid backup name" }, { status: 400 });
  }

  const filepath = path.join(BACKUP_DIR, name);
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
