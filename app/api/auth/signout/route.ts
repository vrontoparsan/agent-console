import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // Clear HTTP session cookie
  response.cookies.set("authjs.session-token", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });

  // Clear HTTPS session cookie — __Secure- prefix REQUIRES secure: true
  response.cookies.set("__Secure-authjs.session-token", "", {
    httpOnly: true,
    secure: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}
