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
  "/api/wl",
  "/api/track",
  "/api/cron/analytics",
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
}

function getSubdomain(host: string): string | null {
  // Remove port if present
  const hostname = host.split(":")[0] ?? host;

  // In development, no subdomain detection
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }

  // Ignore Vercel preview/deployment URLs
  if (hostname.endsWith(".vercel.app")) {
    return null;
  }

  // Expected format: {slug}.accessaudit.com
  // Split and check we have at least 3 parts (slug + accessaudit + com)
  const parts = hostname.split(".");
  if (parts.length < 3) {
    return null; // bare domain like accessaudit.com
  }

  const subdomain = parts[0] ?? null;
  if (!subdomain) {
    return null;
  }

  // Ignore www — treat as main domain
  if (subdomain === "www") {
    return null;
  }

  return subdomain;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // Check for subdomain
  const subdomain = getSubdomain(host);

  if (subdomain) {
    // White-label subdomain detected — validate and rewrite
    // Allow internal /wl/ routes to pass through (already rewritten)
    if (pathname.startsWith("/wl/")) {
      return NextResponse.next();
    }

    // Verify org exists and has white-label access
    const verifyUrl = new URL(`/api/wl/verify/${subdomain}`, request.url);
    try {
      const res = await fetch(verifyUrl);
      const data = await res.json();

      if (!data.valid) {
        return NextResponse.redirect("https://accessaudit.com");
      }
    } catch {
      // Verification failed — redirect to main site
      return NextResponse.redirect("https://accessaudit.com");
    }

    // Rewrite to white-label route group
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/wl/${subdomain}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  // --- Standard (non-subdomain) routing below ---

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
