import { auth } from "./auth";
import { tenantPrisma, getTenantSchema } from "./prisma-tenant";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

type AuthedSession = Session & {
  user: { id: string; email: string; name: string; role: string; tenantId: string | null };
};

type TenantContext = {
  session: AuthedSession;
  tenantId: string;
  tenantSchema: string;
  db: ReturnType<typeof tenantPrisma>;
  role: string;
};

type AuthError = {
  error: NextResponse;
};

/**
 * Standard auth + tenant context for API routes.
 * Returns session, tenantId, tenantSchema, and scoped Prisma client.
 */
export async function requireTenantAuth(): Promise<TenantContext | AuthError> {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const tenantId = (session.user as AuthedSession["user"]).tenantId;
  if (!tenantId) {
    return { error: NextResponse.json({ error: "No tenant context" }, { status: 403 }) };
  }

  const db = tenantPrisma(tenantId);
  const tenantSchema = getTenantSchema(tenantId);

  return {
    session: session as AuthedSession,
    tenantId,
    tenantSchema,
    db,
    role: (session.user as AuthedSession["user"]).role,
  };
}

/**
 * Type guard to check if result is an error.
 */
export function isAuthError(result: TenantContext | AuthError): result is AuthError {
  return "error" in result;
}

/**
 * Require auth but allow platform SUPERADMIN (no tenant context).
 * Useful for routes that both tenant users and superadmin can access.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session: session as AuthedSession, role: (session.user as AuthedSession["user"]).role };
}
