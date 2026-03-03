import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();

  // Clear both possible session cookie names (HTTP vs HTTPS)
  cookieStore.delete("authjs.session-token");
  cookieStore.delete("__Secure-authjs.session-token");

  return NextResponse.json({ ok: true });
}
