import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Validate table name: must start with cstm_ or custom_ (legacy), only alphanumeric + underscore.
 */
function isValidTable(table: string): boolean {
  return /^(cstm_|custom_)[a-z0-9_]+$/.test(table);
}

/**
 * Validate column name: only alphanumeric + underscore.
 */
function isValidColumn(col: string): boolean {
  return /^[a-z0-9_]+$/i.test(col);
}

/**
 * Check if MANAGER has access to a cstm_ table via their page access.
 * Looks through CustomPages the user has access to and checks if any
 * component references the given table.
 */
async function managerHasTableAccess(userId: string, table: string): Promise<boolean> {
  const accessList = await prisma.userPageAccess.findMany({
    where: { userId },
    select: { pageId: true },
  });

  if (accessList.length === 0) return false;

  const pages = await prisma.customPage.findMany({
    where: { id: { in: accessList.map((a) => a.pageId) } },
    select: { config: true, code: true },
  });

  for (const page of pages) {
    // Check JSON config components
    const config = page.config as { components?: { props?: { table?: string } }[] };
    if (config?.components) {
      for (const comp of config.components) {
        if (comp.props?.table === table) return true;
      }
    }
    // Check instance code for useCstmQuery/useCstmMutation references
    if (page.code) {
      const tablePattern = new RegExp(`useCstm(?:Query|Mutation)\\s*\\(\\s*["']${table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
      if (tablePattern.test(page.code)) return true;
    }
  }

  return false;
}

/**
 * Get text columns for a table (for ILIKE search).
 */
async function getTextColumns(table: string): Promise<string[]> {
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'instance' AND table_name = $1
     AND data_type IN ('text', 'character varying', 'character')`,
    table
  );
  return cols.map((c) => c.column_name);
}

/**
 * GET — query cstm_ table with server-side sort, filter, search, pagination.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const table = params.get("table") || "";

  if (!isValidTable(table)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }

  // Permission check
  if (session.user.role === "MANAGER") {
    const hasAccess = await managerHasTableAccess(session.user.id, table);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = Math.max(1, parseInt(params.get("page") || "1"));
  const pageSize = Math.min(Math.max(1, parseInt(params.get("pageSize") || "20")), 100);
  const sort = params.get("sort");
  const dir = params.get("dir") === "asc" ? "ASC" : "DESC";
  const search = params.get("search") || "";

  // Collect filter_* params
  const filters: { column: string; value: string }[] = [];
  for (const [key, value] of params.entries()) {
    if (key.startsWith("filter_") && value) {
      const col = key.slice(7); // remove "filter_"
      if (isValidColumn(col)) {
        filters.push({ column: col, value });
      }
    }
  }

  try {
    // Build WHERE clauses
    const whereParts: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    // Exact filters
    for (const f of filters) {
      whereParts.push(`"${f.column}" = $${paramIdx}`);
      queryParams.push(f.value);
      paramIdx++;
    }

    // Full-text search across text columns
    if (search) {
      const textCols = await getTextColumns(table);
      if (textCols.length > 0) {
        const searchClauses = textCols.map((col) => {
          const clause = `"${col}" ILIKE $${paramIdx}`;
          return clause;
        });
        whereParts.push(`(${searchClauses.join(" OR ")})`);
        queryParams.push(`%${search}%`);
        paramIdx++;
      }
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Sort
    let orderClause = "ORDER BY created_at DESC";
    if (sort && isValidColumn(sort)) {
      orderClause = `ORDER BY "${sort}" ${dir} NULLS LAST`;
    }

    // Count
    const countResult = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint as count FROM instance."${table}" ${whereClause}`,
      ...queryParams
    );
    const total = Number(countResult[0]?.count || 0);

    // Data
    const data = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM instance."${table}" ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      ...queryParams
    );

    // Get column info
    const colInfo = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string }[]>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'instance' AND table_name = $1
       ORDER BY ordinal_position`,
      table
    );

    return NextResponse.json({
      data,
      columns: colInfo.map((c) => ({ key: c.column_name, type: c.data_type })),
      total,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Query failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST — insert record into cstm_ table.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { table, data } = body as { table: string; data: Record<string, unknown> };

  if (!table || !isValidTable(table)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "data object required" }, { status: 400 });
  }

  if (session.user.role === "MANAGER") {
    const hasAccess = await managerHasTableAccess(session.user.id, table);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Filter out id, created_at, updated_at — we set those ourselves
    const entries = Object.entries(data).filter(
      ([key]) => !["id", "created_at", "updated_at"].includes(key) && isValidColumn(key)
    );

    const columns = ["id", ...entries.map(([k]) => `"${k}"`), "created_at", "updated_at"].join(", ");
    const paramIdx = entries.map((_, i) => `$${i + 1}`);
    const placeholders = ["gen_random_uuid()", ...paramIdx, "NOW()", "NOW()"].join(", ");
    const values = entries.map(([, v]) => v);

    const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO instance."${table}" (${columns}) VALUES (${placeholders}) RETURNING *`,
      ...values
    );

    return NextResponse.json(result[0], { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Insert failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * PUT — update record in cstm_ table.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { table, id, data } = body as { table: string; id: string; data: Record<string, unknown> };

  if (!table || !isValidTable(table)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!data || typeof data !== "object") {
    return NextResponse.json({ error: "data object required" }, { status: 400 });
  }

  if (session.user.role === "MANAGER") {
    const hasAccess = await managerHasTableAccess(session.user.id, table);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const entries = Object.entries(data).filter(
      ([key]) => !["id", "created_at", "updated_at"].includes(key) && isValidColumn(key)
    );

    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`);
    setClauses.push(`updated_at = NOW()`);
    const values = [...entries.map(([, v]) => v), id];

    const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `UPDATE instance."${table}" SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
      ...values
    );

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (err) {
    return NextResponse.json(
      { error: "Update failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * DELETE — delete record from cstm_ table.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const table = req.nextUrl.searchParams.get("table") || "";
  const id = req.nextUrl.searchParams.get("id") || "";

  if (!isValidTable(table)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (session.user.role === "MANAGER") {
    const hasAccess = await managerHasTableAccess(session.user.id, table);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.$executeRawUnsafe(`DELETE FROM instance."${table}" WHERE id = $1`, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Delete failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
