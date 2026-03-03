import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { encode } from "next-auth/jwt";

const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || "secret");

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const { payload } = await jwtVerify(token, secret);

    // Determine cookie name based on environment
    const isSecure = req.nextUrl.protocol === "https:";
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    // Create a NextAuth-compatible session JWT
    const sessionToken = await encode({
      token: {
        sub: payload.userId as string,
        email: payload.email as string,
        name: payload.name as string,
        role: payload.role as string,
        id: payload.userId as string,
        tenantId: payload.tenantId as string,
        isImpersonating: true,
        impersonatedBy: payload.impersonatedBy as string,
      },
      secret: process.env.NEXTAUTH_SECRET || "secret",
      salt: cookieName,
    });

    const response = NextResponse.redirect(new URL("/events", req.url));
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4, // 4 hours
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
