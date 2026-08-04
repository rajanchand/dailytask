import { auth } from "@/server/auth";
import { NextResponse } from "next/server";

const authRoutes = ["/login", "/register", "/forgot-password", "/reset-password"];

const protectedPrefixes = [
  "/dashboard",
  "/planner",
  "/tasks",
  "/kanban",
  "/calendar",
  "/projects",
  "/reports",
  "/team",
  "/analytics",
  "/notifications",
  "/discord",
  "/settings",
  "/activity",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const isAuthRoute = authRoutes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const isProtected = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
