import { type NextRequest, NextResponse } from "next/server";

const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/verify-email",
  "/api/auth",
  "/invite",
  "/pricing",
  "/share",
  "/api/badge",
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/trpc")
  ) {
    return NextResponse.next();
  }

  // Check for Better-Auth session cookie
  const sessionToken = request.cookies.get("better-auth.session_token");
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
