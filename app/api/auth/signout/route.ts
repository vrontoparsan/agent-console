import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Clear both HTTP and HTTPS session cookies by setting expired
  for (const name of ["authjs.session-token", "__Secure-authjs.session-token"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
