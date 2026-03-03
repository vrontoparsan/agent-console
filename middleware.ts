import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role;

  // Public routes — no auth required
  const isPublicRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/api/auth");

  if (isPublicRoute) {
    // Redirect logged-in users away from public pages
    if (isLoggedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
      if (userRole === "SUPERADMIN") {
        return NextResponse.redirect(new URL("/superadmin", req.url));
      }
      return NextResponse.redirect(new URL("/events", req.url));
    }
    return NextResponse.next();
  }

  // Not logged in — redirect to login
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Superadmin routes — SUPERADMIN only
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/api/superadmin")) {
    if (userRole !== "SUPERADMIN") {
      return NextResponse.redirect(new URL("/events", req.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
