# Phase 7: White-Label Subdomain Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Agency and Pro tier agencies to serve branded client-facing pages under `{org-slug}.accessaudit.com`, with a branded landing page at the root and share-token-based report access.

**Architecture:** Next.js middleware detects subdomains from the Host header, validates the org slug and plan eligibility, then rewrites requests to a `(white-label)` route group with its own branded layout. No new database tables — uses existing `org.slug`, `org.logo`, `org.name`, and `organizationSettings.brandColor`.

**Tech Stack:** Next.js 15 middleware, App Router route groups, Drizzle ORM queries, Vercel wildcard domains

---

## File Manifest

### New Files
- `apps/web/src/app/api/wl/verify/[slug]/route.ts` — Lightweight org verification endpoint for middleware
- `apps/web/src/app/(white-label)/wl/[slug]/layout.tsx` — Branded layout with org logo, brandColor, "Powered by" footer
- `apps/web/src/app/(white-label)/wl/[slug]/page.tsx` — Landing page (org branding, no data)
- `apps/web/src/app/(white-label)/wl/[slug]/r/[shareToken]/page.tsx` — Branded share report page
- `apps/web/src/lib/reserved-slugs.ts` — Reserved slug list for validation

### Modified Files
- `packages/db/src/plans.ts` — Set Agency `whiteLabel: true`, add `canUseWhiteLabel()` helper
- `apps/web/src/middleware.ts` — Add subdomain detection and rewrite logic
- `apps/web/src/components/dashboard/share-link-table.tsx` — Use subdomain URL when org has white-label
- `apps/web/src/app/(dashboard)/settings/page.tsx` — Show white-label subdomain URL card
- `apps/web/src/trpc/routers/organization.ts` — Add `getOrgBySlug` public procedure for verification endpoint

---

### Task 1: Plan Gating Update

**Files:**
- Modify: `packages/db/src/plans.ts`

- [ ] **Step 1: Update Agency plan whiteLabel flag**

In `packages/db/src/plans.ts`, change the Agency plan's `whiteLabel` from `false` to `true`:

```typescript
// Line 79 in the agency features object
whiteLabel: true,  // was false
```

- [ ] **Step 2: Add canUseWhiteLabel helper**

Add after the `isBrandedReport` function (after line 135):

```typescript
export function canUseWhiteLabel(plan: string): boolean {
  return getPlan(plan).features.whiteLabel;
}
```

- [ ] **Step 3: Verify**

Run: `cd packages/db && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/plans.ts
git commit -m "feat: enable white-label for Agency plan and add canUseWhiteLabel helper"
```

---

### Task 2: Reserved Slugs List

**Files:**
- Create: `apps/web/src/lib/reserved-slugs.ts`

- [ ] **Step 1: Create reserved slugs module**

```typescript
// Slugs that cannot be used as org slugs because they conflict
// with infrastructure subdomains or reserved names.
export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "mail",
  "smtp",
  "ftp",
  "status",
  "blog",
  "docs",
  "help",
  "support",
  "cdn",
  "static",
  "assets",
  "staging",
  "dev",
  "test",
  "demo",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/reserved-slugs.ts
git commit -m "feat: add reserved slugs list for subdomain validation"
```

---

### Task 3: Org Verification Endpoint

**Files:**
- Create: `apps/web/src/app/api/wl/verify/[slug]/route.ts`

This lightweight endpoint is called by middleware to validate whether a subdomain slug maps to a white-label-eligible org. It must be fast — simple indexed lookup.

- [ ] **Step 1: Create the verification route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@access-audit/db/client";
import { organization, organizationSettings } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import { canUseWhiteLabel } from "@access-audit/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const org = await db
    .select({
      id: organization.id,
      name: organization.name,
      logo: organization.logo,
    })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0]) {
    return NextResponse.json({ valid: false });
  }

  const settings = await db
    .select({ plan: organizationSettings.plan, brandColor: organizationSettings.brandColor })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, org[0].id));

  const plan = settings[0]?.plan ?? "trial";

  if (!canUseWhiteLabel(plan)) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true });
}
```

- [ ] **Step 2: Verify the canUseWhiteLabel export is available**

Check that `packages/db/src/index.ts` exports `canUseWhiteLabel`. If other plan helpers like `canUseBadge` are exported there, add `canUseWhiteLabel` to the same export list:

Run: `grep -n "canUseBadge\|canUseWhiteLabel" packages/db/src/index.ts`

If `canUseWhiteLabel` is not exported, add it alongside the other plan helper exports.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/wl/verify/[slug]/route.ts
# Also add packages/db/src/index.ts if modified
git commit -m "feat: add org verification endpoint for white-label middleware"
```

---

### Task 4: Middleware Subdomain Detection

**Files:**
- Modify: `apps/web/src/middleware.ts`

This is the core routing logic. The middleware detects subdomains, validates them via the verification endpoint, and rewrites to the `(white-label)` route group.

- [ ] **Step 1: Replace middleware with subdomain-aware version**

Replace the entire contents of `apps/web/src/middleware.ts`:

```typescript
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
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
}

function getSubdomain(host: string): string | null {
  // Remove port if present
  const hostname = host.split(":")[0];

  // In development, no subdomain detection
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }

  // Expected format: {slug}.accessaudit.com
  // Split and check we have at least 3 parts (slug + accessaudit + com)
  const parts = hostname.split(".");
  if (parts.length < 3) {
    return null; // bare domain like accessaudit.com
  }

  const subdomain = parts[0];

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
        // Invalid subdomain — redirect to main site
        const mainUrl = new URL("/", request.url);
        mainUrl.hostname = request.nextUrl.hostname.replace(`${subdomain}.`, "");
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
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat: add subdomain detection and white-label rewriting to middleware"
```

---

### Task 5: White-Label Branded Layout

**Files:**
- Create: `apps/web/src/app/(white-label)/wl/[slug]/layout.tsx`

The layout fetches org branding and renders a branded shell with header (logo), content area, and "Powered by" footer.

- [ ] **Step 1: Create directory structure**

Run: `mkdir -p apps/web/src/app/\(white-label\)/wl/\[slug\]/r/\[shareToken\]`

- [ ] **Step 2: Create the branded layout**

```typescript
import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import { organization, organizationSettings } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import type { Metadata } from "next";

interface WlLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const org = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.slug, slug));

  const orgName = org[0]?.name ?? "Accessibility Report";

  return {
    title: `${orgName} | Accessibility Report`,
  };
}

export default async function WhiteLabelLayout({
  children,
  params,
}: WlLayoutProps) {
  const { slug } = await params;

  // Fetch org branding
  const org = await db
    .select({
      id: organization.id,
      name: organization.name,
      logo: organization.logo,
    })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0]) {
    notFound();
  }

  const settings = await db
    .select({ brandColor: organizationSettings.brandColor })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, org[0].id));

  const brandColor = settings[0]?.brandColor ?? "#6366f1";
  const logoUrl = org[0].logo;
  const orgName = org[0].name;

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ "--wl-brand-color": brandColor } as React.CSSProperties}
    >
      {/* Branded Header */}
      <header
        className="border-b bg-white px-6 py-4"
        style={{ borderBottomColor: brandColor }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={orgName}
                className="h-8 w-auto object-contain"
              />
            ) : null}
            <span className="text-lg font-semibold text-gray-900">
              {orgName}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      {children}

      {/* Powered by Footer */}
      <footer className="border-t bg-white px-6 py-4 text-center text-xs text-gray-400">
        Powered by{" "}
        <a
          href="https://accessaudit.com"
          className="text-gray-500 underline hover:text-gray-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          AccessAudit
        </a>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(white-label\)
git commit -m "feat: add white-label branded layout with org logo and brandColor"
```

---

### Task 6: White-Label Landing Page

**Files:**
- Create: `apps/web/src/app/(white-label)/wl/[slug]/page.tsx`

Simple branded landing page — org logo centered, org name, brief tagline. No data exposed.

- [ ] **Step 1: Create the landing page**

```typescript
import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import { organization } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";

interface WlLandingProps {
  params: Promise<{ slug: string }>;
}

export default async function WhiteLabelLandingPage({
  params,
}: WlLandingProps) {
  const { slug } = await params;

  const org = await db
    .select({
      name: organization.name,
      logo: organization.logo,
    })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0]) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
      {org[0].logo ? (
        <img
          src={org[0].logo}
          alt={org[0].name}
          className="mb-8 h-20 w-auto object-contain"
        />
      ) : (
        <h1 className="mb-8 text-4xl font-bold text-gray-900">
          {org[0].name}
        </h1>
      )}

      {org[0].logo && (
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          {org[0].name}
        </h1>
      )}

      <p className="text-lg text-gray-500">Accessibility Compliance Reports</p>

      <p className="mt-8 text-sm text-gray-400">
        If you have received a report link, please use the full URL provided to
        you to access your compliance report.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(white-label\)/wl/\[slug\]/page.tsx
git commit -m "feat: add white-label branded landing page"
```

---

### Task 7: White-Label Share Report Page

**Files:**
- Create: `apps/web/src/app/(white-label)/wl/[slug]/r/[shareToken]/page.tsx`

This reuses the same data fetching logic as the existing share page (`apps/web/src/app/share/[shareToken]/page.tsx`) but renders within the white-label layout. It also validates that the report's org matches the subdomain slug.

- [ ] **Step 1: Create the branded share report page**

```typescript
import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import {
  reports,
  scans,
  scanPages,
  violations,
  sites,
  organization,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";

interface WlSharePageProps {
  params: Promise<{ slug: string; shareToken: string }>;
}

export default async function WhiteLabelSharePage({
  params,
}: WlSharePageProps) {
  const { slug, shareToken } = await params;

  // Fetch report by share token
  const report = await db
    .select()
    .from(reports)
    .where(eq(reports.shareToken, shareToken));

  if (!report[0]) {
    notFound();
  }

  const r = report[0];

  // Validate report belongs to this org's subdomain
  const org = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0] || org[0].id !== r.organizationId) {
    notFound();
  }

  // Check expiration
  if (r.expiresAt && new Date() > r.expiresAt) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Report Expired</h1>
        <p className="mt-2 text-gray-600">
          This report has expired. Contact your agency for an updated link.
        </p>
      </main>
    );
  }

  // Fetch site
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, r.siteId));

  if (!site[0]) {
    notFound();
  }

  // Determine which scan to show
  let scanData;
  let pageData;
  let violationData;
  let trendData: Array<{ score: number; date: string }> = [];

  if (r.type === "share_snapshot" && r.scanId) {
    const scan = await db
      .select()
      .from(scans)
      .where(eq(scans.id, r.scanId));
    scanData = scan[0] ?? null;
  } else {
    const recentScans = await db
      .select()
      .from(scans)
      .where(and(eq(scans.siteId, r.siteId), eq(scans.status, "completed")))
      .orderBy(desc(scans.createdAt))
      .limit(10);

    scanData = recentScans[0] ?? null;
    trendData = recentScans
      .reverse()
      .map((s) => ({
        score: s.complianceScore ?? 0,
        date: new Date(s.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }));
  }

  if (!scanData) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col items-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900">No Scan Data</h1>
        <p className="mt-2 text-gray-600">No completed scans available yet.</p>
      </main>
    );
  }

  // Fetch pages and violations for the scan
  pageData = await db
    .select()
    .from(scanPages)
    .where(eq(scanPages.scanId, scanData.id));

  violationData = await db
    .select()
    .from(violations)
    .where(eq(violations.scanId, scanData.id));

  const violationCounts = (scanData.violationCounts ?? {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  }) as { critical: number; serious: number; moderate: number; minor: number };

  const pageUrlMap: Record<string, string> = {};
  for (const p of pageData) {
    pageUrlMap[p.id] = p.url;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Site + Score */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{site[0].name}</h1>
        <p className="text-gray-500">{site[0].url}</p>
        <div className="mt-4 flex items-baseline gap-2">
          <span
            className="text-5xl font-bold"
            style={{ color: "var(--wl-brand-color, #6366f1)" }}
          >
            {scanData.complianceScore ?? 0}%
          </span>
          <span className="text-gray-500">Compliance Score</span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Scanned on{" "}
          {new Date(scanData.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Trend chart for live view */}
      {r.type === "share_live" && trendData.length > 1 && (
        <div className="mb-8 rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Score Trend
          </h2>
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {trendData.map((point, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-xs font-medium text-gray-700">
                  {point.score}%
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${point.score}%`,
                    backgroundColor: "var(--wl-brand-color, #6366f1)",
                    minHeight: 4,
                  }}
                />
                <span className="text-xs text-gray-400">{point.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Violation Summary */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            { label: "Critical", count: violationCounts.critical, color: "#dc2626" },
            { label: "Serious", count: violationCounts.serious, color: "#ea580c" },
            { label: "Moderate", count: violationCounts.moderate, color: "#ca8a04" },
            { label: "Minor", count: violationCounts.minor, color: "#16a34a" },
          ] as const
        ).map((item) => (
          <div
            key={item.label}
            className="rounded-lg border bg-white p-4 text-center"
          >
            <p className="text-3xl font-bold" style={{ color: item.color }}>
              {item.count}
            </p>
            <p className="text-sm text-gray-500">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Page-by-Page Breakdown */}
      <div className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Page-by-Page Breakdown
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">URL</th>
                <th className="pb-2 font-medium">Score</th>
                <th className="pb-2 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((page) => {
                const counts = (page.violationCounts ?? {
                  critical: 0,
                  serious: 0,
                  moderate: 0,
                  minor: 0,
                }) as {
                  critical: number;
                  serious: number;
                  moderate: number;
                  minor: number;
                };
                return (
                  <tr key={page.id} className="border-b">
                    <td className="py-2 text-gray-700">{page.url}</td>
                    <td className="py-2">{page.complianceScore ?? "—"}%</td>
                    <td className="py-2">
                      {counts.critical + counts.serious + counts.moderate + counts.minor}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Violations List */}
      <div className="mb-8 rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Violations ({violationData.length})
        </h2>
        <div className="space-y-4">
          {violationData.slice(0, 50).map((v) => (
            <div key={v.id} className="border-b pb-4">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    v.impact === "critical"
                      ? "bg-red-100 text-red-800"
                      : v.impact === "serious"
                        ? "bg-orange-100 text-orange-800"
                        : v.impact === "moderate"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                  }`}
                >
                  {v.impact}
                </span>
                <span className="font-medium text-gray-900">{v.ruleId}</span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Page: {pageUrlMap[v.scanPageId] ?? "Unknown"}
              </p>
              <p className="mt-1 text-sm text-gray-700">{v.description}</p>
              {v.aiExplanation && (
                <div className="mt-2 rounded bg-blue-50 p-3 text-sm text-blue-900">
                  <strong>Explanation:</strong> {v.aiExplanation}
                </div>
              )}
              {v.aiFixCode && (
                <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
                  {v.aiFixCode}
                </pre>
              )}
            </div>
          ))}
          {violationData.length > 50 && (
            <p className="text-center text-sm text-gray-400">
              Showing first 50 of {violationData.length} violations.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(white-label\)/wl/\[slug\]/r/\[shareToken\]/page.tsx
git commit -m "feat: add white-label branded share report page"
```

---

### Task 8: Share Link URL Update

**Files:**
- Modify: `apps/web/src/components/dashboard/share-link-table.tsx`

When an agency has white-label enabled, the copied share link URL should use their subdomain format instead of the main domain. Currently `handleCopy` uses `window.location.origin/share/{token}`.

- [ ] **Step 1: Add orgSlug and whiteLabel props**

Update the `ShareLinkTableProps` interface and `handleCopy` function in `apps/web/src/components/dashboard/share-link-table.tsx`:

At the interface (line 16-20), add two new props:

```typescript
interface ShareLinkTableProps {
  siteId: string;
  canAccess: boolean;
  scans: Array<{ id: string; createdAt: Date | string; complianceScore: number | null }>;
  orgSlug?: string | null;
  hasWhiteLabel?: boolean;
}
```

Update the component signature (line 22) to destructure new props:

```typescript
export function ShareLinkTable({ siteId, canAccess, scans, orgSlug, hasWhiteLabel }: ShareLinkTableProps) {
```

Update `handleCopy` (lines 62-67) to use subdomain URL when white-label is enabled:

```typescript
  function handleCopy(token: string) {
    let url: string;
    if (hasWhiteLabel && orgSlug) {
      // Use white-label subdomain URL
      const baseDomain = window.location.hostname.split(".").slice(-2).join(".");
      const protocol = window.location.protocol;
      url = `${protocol}//${orgSlug}.${baseDomain}/r/${token}`;
    } else {
      url = `${window.location.origin}/share/${token}`;
    }
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }
```

- [ ] **Step 2: Update the parent component that passes props**

Find where `ShareLinkTable` is used and pass the new props. Search for the import:

Run: `grep -rn "ShareLinkTable" apps/web/src --include="*.tsx" | grep -v "share-link-table.tsx"`

Update the parent to pass `orgSlug` and `hasWhiteLabel` from the org query data. The parent will need access to the org's slug and plan. Since the Deliverables tab already has org context, this should be available. Pass the values down:

```typescript
<ShareLinkTable
  siteId={siteId}
  canAccess={canShareLinks(plan)}
  scans={scansData}
  orgSlug={org?.slug}
  hasWhiteLabel={canUseWhiteLabel(plan)}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/share-link-table.tsx
# Also add the parent component if modified
git commit -m "feat: use white-label subdomain URL when copying share links"
```

---

### Task 9: Settings Page White-Label Card

**Files:**
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

Show the white-label subdomain URL to eligible agencies in the settings page. For ineligible plans, show an upgrade prompt.

- [ ] **Step 1: Add white-label card to settings page**

Add the import at the top of `apps/web/src/app/(dashboard)/settings/page.tsx`:

```typescript
import { canUseWhiteLabel } from "@access-audit/db";
```

After the "Organization Info" card (after line 109), add a new card inside the `<TabsContent value="general">`:

```typescript
          <Card>
            <CardHeader>
              <CardTitle>White-Label Subdomain</CardTitle>
              <CardDescription>
                Serve branded client reports under your own subdomain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {orgQuery.data?.settings?.plan &&
              canUseWhiteLabel(orgQuery.data.settings.plan) ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Your subdomain:
                    </span>
                    <code className="rounded bg-muted px-2 py-1 text-sm font-medium">
                      {orgQuery.data?.organization?.slug}.accessaudit.com
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `https://${orgQuery.data?.organization?.slug}.accessaudit.com`
                        );
                        toast.success("Subdomain URL copied!");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share links created for your sites will automatically use
                    this subdomain. Your clients will see your branding instead
                    of AccessAudit.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Agency or Pro to serve branded reports under your
                    own subdomain.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/pricing">View Plans</a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add white-label subdomain card to organization settings"
```

---

### Task 10: TypeScript Verification & Cleanup

**Files:**
- Potentially any of the above files

- [ ] **Step 1: Run full TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`

Fix any errors found. Common issues to watch for:
- Missing imports for `canUseWhiteLabel` from `@access-audit/db`
- Type mismatches in component props
- Missing exports from `packages/db/src/index.ts`

- [ ] **Step 2: Verify middleware doesn't break existing routes**

Run the dev server and verify:
1. `localhost:3000/` — main landing page loads
2. `localhost:3000/login` — login page loads
3. `localhost:3000/dashboard` — redirects to login (no session)
4. `/wl/test-slug` — directly accessible for local dev testing

Run: `cd apps/web && npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from Phase 7 integration"
```

---

### Task 11: Update Phase Docs & Close Out

**Files:**
- Modify: `docs/phases.md`

- [ ] **Step 1: Update phases.md**

Change Phase 7 status from "Not Started" to "Complete":

```markdown
| 7 | White-label subdomain routing | Complete | Agency tier feature |
```

- [ ] **Step 2: Commit**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 7 White-Label Subdomain Routing as complete"
```
