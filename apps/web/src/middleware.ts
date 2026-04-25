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

const BASE_DOMAIN = process.env.BASE_DOMAIN; // e.g. "accessaudit.com"

function getSubdomain(host: string): string | null {
  if (!BASE_DOMAIN) return null;

  const hostname = host.split(":")[0] ?? host;

  if (!hostname.endsWith(`.${BASE_DOMAIN}`)) {
    return null;
  }

  const subdomain = hostname.slice(0, -(BASE_DOMAIN.length + 1));

  if (!subdomain || subdomain === "www") {
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
