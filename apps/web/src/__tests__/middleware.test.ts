import { describe, it, expect } from "vitest";

// Since isPublicPath and getSubdomain are not exported from middleware.ts,
// we copy the pure logic functions here for unit testing.

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

function getSubdomain(
  host: string,
  baseDomain: string | undefined
): string | null {
  if (!baseDomain) return null;

  const hostname = host.split(":")[0] ?? host;

  if (!hostname.endsWith(`.${baseDomain}`)) {
    return null;
  }

  const subdomain = hostname.slice(0, -(baseDomain.length + 1));

  if (!subdomain || subdomain === "www") {
    return null;
  }

  return subdomain;
}

describe("isPublicPath", () => {
  describe("exact matches for each public path", () => {
    it.each(publicPaths)("returns true for exact path '%s'", (path) => {
      expect(isPublicPath(path)).toBe(true);
    });
  });

  describe("subpath matching", () => {
    it("matches /api/auth/callback as subpath of /api/auth", () => {
      expect(isPublicPath("/api/auth/callback")).toBe(true);
    });

    it("matches /api/auth/callback/github as subpath of /api/auth", () => {
      expect(isPublicPath("/api/auth/callback/github")).toBe(true);
    });

    it("matches /share/abc123 as subpath of /share", () => {
      expect(isPublicPath("/share/abc123")).toBe(true);
    });

    it("matches /api/badge/site-id as subpath of /api/badge", () => {
      expect(isPublicPath("/api/badge/site-id")).toBe(true);
    });

    it("matches /api/wl/verify/slug as subpath of /api/wl", () => {
      expect(isPublicPath("/api/wl/verify/slug")).toBe(true);
    });

    it("matches /api/track/event as subpath of /api/track", () => {
      expect(isPublicPath("/api/track/event")).toBe(true);
    });

    it("matches /invite/token-id as subpath of /invite", () => {
      expect(isPublicPath("/invite/token-id")).toBe(true);
    });

    it("matches /api/cron/analytics/daily as subpath", () => {
      expect(isPublicPath("/api/cron/analytics/daily")).toBe(true);
    });

    it("matches /login/reset as subpath of /login", () => {
      expect(isPublicPath("/login/reset")).toBe(true);
    });
  });

  describe("non-public paths return false", () => {
    it("returns false for /dashboard", () => {
      expect(isPublicPath("/dashboard")).toBe(false);
    });

    it("returns false for /sites", () => {
      expect(isPublicPath("/sites")).toBe(false);
    });

    it("returns false for /team", () => {
      expect(isPublicPath("/team")).toBe(false);
    });

    it("returns false for /settings", () => {
      expect(isPublicPath("/settings")).toBe(false);
    });

    it("returns false for /sites/123/scans", () => {
      expect(isPublicPath("/sites/123/scans")).toBe(false);
    });

    it("returns false for /reports", () => {
      expect(isPublicPath("/reports")).toBe(false);
    });
  });

  describe("internal paths are not in publicPaths", () => {
    it("returns false for /_next (handled separately in middleware)", () => {
      expect(isPublicPath("/_next")).toBe(false);
    });

    it("returns false for /_next/static/chunk.js", () => {
      expect(isPublicPath("/_next/static/chunk.js")).toBe(false);
    });

    it("returns false for /api/trpc (handled separately in middleware)", () => {
      expect(isPublicPath("/api/trpc")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("does not match path prefix without slash (e.g., /loginpage)", () => {
      expect(isPublicPath("/loginpage")).toBe(false);
    });

    it("does not match /pricingplan as it is not /pricing/plan", () => {
      expect(isPublicPath("/pricingplan")).toBe(false);
    });

    it("does not match /signup-complete (no slash separator)", () => {
      expect(isPublicPath("/signup-complete")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isPublicPath("")).toBe(false);
    });
  });
});

describe("getSubdomain", () => {
  const BASE_DOMAIN = "accessaudit.com";

  describe("with BASE_DOMAIN set", () => {
    it("extracts 'agency' from 'agency.accessaudit.com'", () => {
      expect(getSubdomain("agency.accessaudit.com", BASE_DOMAIN)).toBe(
        "agency"
      );
    });

    it("returns null for 'www.accessaudit.com' (www is filtered)", () => {
      expect(getSubdomain("www.accessaudit.com", BASE_DOMAIN)).toBeNull();
    });

    it("returns null for 'accessaudit.com' (no subdomain)", () => {
      expect(getSubdomain("accessaudit.com", BASE_DOMAIN)).toBeNull();
    });

    it("returns null for 'agency.other.com' (different domain)", () => {
      expect(getSubdomain("agency.other.com", BASE_DOMAIN)).toBeNull();
    });

    it("strips port and extracts subdomain from 'agency.accessaudit.com:3000'", () => {
      expect(getSubdomain("agency.accessaudit.com:3000", BASE_DOMAIN)).toBe(
        "agency"
      );
    });

    it("returns null for empty string", () => {
      expect(getSubdomain("", BASE_DOMAIN)).toBeNull();
    });

    it("extracts 'my-agency' from 'my-agency.accessaudit.com'", () => {
      expect(getSubdomain("my-agency.accessaudit.com", BASE_DOMAIN)).toBe(
        "my-agency"
      );
    });

    it("extracts 'test123' from 'test123.accessaudit.com'", () => {
      expect(getSubdomain("test123.accessaudit.com", BASE_DOMAIN)).toBe(
        "test123"
      );
    });

    it("returns null for 'notaccessaudit.com' (partial domain match)", () => {
      expect(getSubdomain("notaccessaudit.com", BASE_DOMAIN)).toBeNull();
    });

    it("returns null for '.accessaudit.com' (empty subdomain after dot)", () => {
      expect(getSubdomain(".accessaudit.com", BASE_DOMAIN)).toBeNull();
    });

    it("handles deeply nested subdomain 'a.b.accessaudit.com'", () => {
      expect(getSubdomain("a.b.accessaudit.com", BASE_DOMAIN)).toBe("a.b");
    });
  });

  describe("without BASE_DOMAIN (undefined)", () => {
    it("returns null for any host when BASE_DOMAIN is undefined", () => {
      expect(getSubdomain("agency.accessaudit.com", undefined)).toBeNull();
    });

    it("returns null for empty host when BASE_DOMAIN is undefined", () => {
      expect(getSubdomain("", undefined)).toBeNull();
    });

    it("returns null for localhost when BASE_DOMAIN is undefined", () => {
      expect(getSubdomain("localhost:3000", undefined)).toBeNull();
    });
  });

  describe("without BASE_DOMAIN (empty string)", () => {
    it("returns null for any host when BASE_DOMAIN is empty string", () => {
      expect(getSubdomain("agency.accessaudit.com", "")).toBeNull();
    });
  });
});
