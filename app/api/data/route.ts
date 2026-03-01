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
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const table = req.nextUrl.searchParams.get("table") || "Event";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const pageSize = Math.min(
    parseInt(req.nextUrl.searchParams.get("pageSize") || "25"),
    100
  );

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

    // Exclude password hash from User table
    const sanitized = table === "User"
      ? data.map(({ password, ...rest }: Record<string, unknown>) => rest)
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
