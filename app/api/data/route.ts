import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const allowedTables: Record<string, boolean> = {
  Event: true,
  User: true,
  EventAction: true,
  Message: true,
  EventCategory: true,
  AgentContext: true,
  CompanyInfo: true,
  CronJob: true,
  EmailAccount: true,
  UserCategoryAccess: true,
  UserEmailAccountAccess: true,
  CustomPage: true,
  UserPageAccess: true,
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "SUPERADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // List instance tables
  if (req.nextUrl.searchParams.get("list") === "instance") {
    try {
      const rows = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'instance'
        AND (table_name LIKE 'cstm_%' OR table_name LIKE 'custom_%')
        ORDER BY table_name
      `;
      return NextResponse.json(rows.map((r) => r.table_name));
    } catch {
      return NextResponse.json([]);
    }
  }

  const table = req.nextUrl.searchParams.get("table") || "Event";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const pageSize = Math.min(
    parseInt(req.nextUrl.searchParams.get("pageSize") || "25"),
    100
  );

  // Allow cstm_ and custom_ (legacy) tables via raw SQL
  if (table.startsWith("cstm_") || table.startsWith("custom_")) {
    try {
      const countResult = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint as count FROM instance."${table}"`
      );
      const total = Number(countResult[0]?.count || 0);

      const data = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM instance."${table}" ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      );

      const columns = data.length > 0 ? Object.keys(data[0]) : [];
      return NextResponse.json({ data, columns, total });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to query custom table", detail: String(error) },
        { status: 500 }
      );
    }
  }

  if (!allowedTables[table]) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (prisma as any)[
      table.charAt(0).toLowerCase() + table.slice(1)
    ] as {
      findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
      count: () => Promise<number>;
    };

    const [data, total] = await Promise.all([
      model.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      model.count(),
    ]);

    // Exclude sensitive fields
    const sanitized = table === "User"
      ? data.map(({ password, ...rest }: Record<string, unknown>) => rest)
      : table === "EmailAccount"
        ? data.map(({ imapPassword, smtpPassword, ...rest }: Record<string, unknown>) => ({ ...rest, imapPassword: "***", smtpPassword: smtpPassword ? "***" : null }))
        : data;

    const columns =
      sanitized.length > 0 ? Object.keys(sanitized[0]) : [];

    return NextResponse.json({ data: sanitized, columns, total });
  } catch {
    // Some tables don't have createdAt
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (prisma as any)[
        table.charAt(0).toLowerCase() + table.slice(1)
      ] as {
        findMany: (args: Record<string, unknown>) => Promise<Record<string, unknown>[]>;
        count: () => Promise<number>;
      };

      const [data, total] = await Promise.all([
        model.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        model.count(),
      ]);

      const sanitized = table === "User"
        ? data.map(({ password, ...rest }: Record<string, unknown>) => rest)
        : data;

      const columns = sanitized.length > 0 ? Object.keys(sanitized[0]) : [];

      return NextResponse.json({ data: sanitized, columns, total });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to query table", detail: String(error) },
        { status: 500 }
      );
    }
  }
}
