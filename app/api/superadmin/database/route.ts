import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PRISMA_MODELS = [
  "Tenant",
  "User",
  "Event",
  "EventCategory",
  "EmailAccount",
  "EventAction",
  "Message",
  "CustomPage",
  "SectionCategory",
  "UserCategoryAccess",
  "UserEmailAccountAccess",
  "UserPageAccess",
  "Snapshot",
  "CronJob",
  "AgentContext",
  "CompanyInfo",
];

const TENANT_SCOPED = new Set([
  "User",
  "Event",
  "EventCategory",
  "EmailAccount",
  "EventAction",
  "Message",
  "CustomPage",
  "SectionCategory",
  "AgentContext",
  "CronJob",
  "Snapshot",
]);

const SENSITIVE_FIELDS = new Set([
  "password",
  "imapPassword",
  "smtpPassword",
  "smtpUser",
  "imapUser",
]);

function toCamel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key] = SENSITIVE_FIELDS.has(key) && value ? "***" : value;
  }
  return clean;
}

async function requireSuperadmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "SUPERADMIN") return null;
  return session;
}

async function handleTables() {
  // Prisma model counts
  const counts = await Promise.all(
    PRISMA_MODELS.map(async (name) => {
      try {
        const count = await (prisma as any)[toCamel(name)].count();
        return { name, count, type: "prisma" as const, tenantScoped: TENANT_SCOPED.has(name) };
      } catch {
        return { name, count: 0, type: "prisma" as const, tenantScoped: TENANT_SCOPED.has(name) };
      }
    })
  );

  // Tenant custom schemas
  const schemas: { schema_name: string }[] = await prisma.$queryRawUnsafe(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name`
  );

  const customTables: { schema: string; table: string; tenantId: string }[] = [];
  for (const s of schemas) {
    const tables: { table_name: string }[] = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      s.schema_name
    );
    const tenantId = s.schema_name.replace("tenant_", "");
    for (const t of tables) {
      customTables.push({ schema: s.schema_name, table: t.table_name, tenantId });
    }
  }

  return NextResponse.json({ models: counts, customTables });
}

async function handleData(req: NextRequest) {
  const url = req.nextUrl;
  const table = url.searchParams.get("table") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50")));
  const tenantId = url.searchParams.get("tenantId") || "";
  const orderBy = url.searchParams.get("orderBy") || "createdAt";
  const orderDir = url.searchParams.get("orderDir") === "asc" ? "asc" : "desc";

  // Custom table (format: "tenant_xxx.cstm_tablename")
  if (table.includes(".")) {
    const [schema, tableName] = table.split(".", 2);
    if (!schema.startsWith("tenant_") || !tableName) {
      return NextResponse.json({ error: "Invalid custom table" }, { status: 400 });
    }

    // Validate schema and table exist
    const exists: { cnt: bigint }[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint as cnt FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      schema,
      tableName
    );
    if (!exists[0] || exists[0].cnt === BigInt(0)) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const offset = (page - 1) * pageSize;
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${schema}"."${tableName}" ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      pageSize,
      offset
    );

    const countResult: { cnt: bigint }[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::bigint as cnt FROM "${schema}"."${tableName}"`
    );
    const total = Number(countResult[0]?.cnt || 0);

    return NextResponse.json({
      rows: rows.map((r) => sanitizeRow(r)),
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  }

  // Prisma model
  if (!PRISMA_MODELS.includes(table)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  const model = (prisma as any)[toCamel(table)];
  const where: Record<string, unknown> = {};
  if (tenantId && TENANT_SCOPED.has(table)) {
    where.tenantId = tenantId;
  }

  // Build orderBy — fall back to id if field doesn't exist
  let orderByObj: Record<string, string> = {};
  try {
    orderByObj = { [orderBy]: orderDir };
  } catch {
    orderByObj = { id: "desc" };
  }

  const [rows, total] = await Promise.all([
    model.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: orderByObj,
    }).catch(() =>
      // If orderBy field doesn't exist, retry without it
      model.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
      })
    ),
    model.count({ where }),
  ]);

  return NextResponse.json({
    rows: (rows as Record<string, unknown>[]).map(sanitizeRow),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const session = await requireSuperadmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const action = req.nextUrl.searchParams.get("action") || "tables";

  switch (action) {
    case "tables":
      return handleTables();
    case "data":
      return handleData(req);
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
