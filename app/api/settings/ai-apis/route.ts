import { NextRequest, NextResponse } from "next/server";
import { requireTenantAuth, isAuthError } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { invalidateKeyCache } from "@/lib/anthropic";

type ApiKeyEntry = {
  label: string;
  token: string;
};

export async function GET() {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { extra: true },
  });

  const extra = tenant?.extra as Record<string, unknown> | null;
  const keys = (extra?.aiApiKeys as ApiKeyEntry[]) || [];

  // Mask tokens for display (show first 10 + last 4 chars)
  const masked = keys.map((k) => ({
    label: k.label,
    token: k.token
      ? k.token.length > 14
        ? k.token.slice(0, 10) + "..." + k.token.slice(-4)
        : "****"
      : "",
    hasToken: !!k.token?.trim(),
  }));

  return NextResponse.json({ keys: masked });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireTenantAuth();
  if (isAuthError(ctx)) return ctx.error;

  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { keys } = (await req.json()) as { keys: ApiKeyEntry[] };

  if (!Array.isArray(keys) || keys.length > 3) {
    return NextResponse.json({ error: "Invalid keys" }, { status: 400 });
  }

  // Load existing extra to preserve other fields
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { extra: true },
  });

  const existingExtra = (tenant?.extra as Record<string, unknown>) || {};

  // If a token is masked (contains "..."), keep the old value
  const existingKeys = (existingExtra.aiApiKeys as ApiKeyEntry[]) || [];
  const mergedKeys = keys.map((k, i) => {
    if (k.token.includes("...") || k.token === "****") {
      // Keep existing token
      return { label: k.label, token: existingKeys[i]?.token || "" };
    }
    return { label: k.label, token: k.token };
  });

  const newExtra = { ...existingExtra, aiApiKeys: mergedKeys };

  await prisma.tenant.update({
    where: { id: ctx.tenantId },
    data: { extra: newExtra },
  });

  // Invalidate cached client so next request uses new keys
  invalidateKeyCache();

  return NextResponse.json({ ok: true });
}
