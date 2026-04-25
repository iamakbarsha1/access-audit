# Phase 8: Landing Page + Launch Prep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, conversion-focused landing page with privacy-first visitor analytics, SEO infrastructure, and error page polish to prepare AccessAudit for launch.

**Architecture:** Replace the placeholder marketing page with a 9-section landing page (Gradient & Bold style). Add a `page_views` + `page_views_daily` DB schema for privacy-first analytics (hashed IPs, no cookies). Add a daily cron endpoint that aggregates stats and sends a digest email via Resend. Add SEO meta, OG image, sitemap, robots.txt, JSON-LD, custom error pages, and a generated favicon.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, shadcn/ui (Accordion), Drizzle ORM (Neon), Resend (email), Inter font (already loaded)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/db/src/schema/pageViews.ts` | `page_views` + `page_views_daily` table definitions |
| `apps/web/src/components/marketing/marketing-nav.tsx` | Sticky navbar with scroll-aware background |
| `apps/web/src/components/marketing/marketing-footer.tsx` | 4-column footer |
| `apps/web/src/components/marketing/pricing-cards.tsx` | Shared pricing cards (used on landing + /pricing) |
| `apps/web/src/components/marketing/faq-accordion.tsx` | FAQ section with shadcn Accordion |
| `apps/web/src/components/marketing/track-pageview.tsx` | Client component, fires sendBeacon to /api/track |
| `apps/web/src/app/api/track/route.ts` | POST endpoint — hashes IP, inserts page_view |
| `apps/web/src/app/api/cron/analytics/route.ts` | Daily cron — aggregate, email digest, purge old rows |
| `apps/web/src/lib/analytics-email.ts` | Analytics digest email template + send function |
| `apps/web/src/app/opengraph-image.tsx` | Dynamic OG image generation |
| `apps/web/src/app/sitemap.ts` | Dynamic sitemap |
| `apps/web/src/app/robots.ts` | robots.txt |
| `apps/web/src/app/not-found.tsx` | Custom 404 page |
| `apps/web/src/app/error.tsx` | Custom 500 error boundary |
| `apps/web/src/app/icon.tsx` | Generated favicon |
| `apps/web/src/components/ui/accordion.tsx` | shadcn Accordion component |

### Modified Files
| File | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | Add `export * from "./pageViews"` |
| `apps/web/src/app/(marketing)/layout.tsx` | Replace with MarketingNav + MarketingFooter + TrackPageview |
| `apps/web/src/app/(marketing)/page.tsx` | Full rewrite — 9-section landing page |
| `apps/web/src/app/pricing/page.tsx` | Extract PricingCards, use shared component |
| `apps/web/src/app/layout.tsx` | Add comprehensive metadata export |
| `apps/web/src/middleware.ts` | Add `/api/track` to publicPaths |
| `.env.example` | Add `ANALYTICS_ADMIN_EMAIL` |

---

## Task 1: Install shadcn Accordion Component

**Files:**
- Create: `apps/web/src/components/ui/accordion.tsx`

- [ ] **Step 1: Install the Accordion component via shadcn CLI**

Run from `apps/web`:
```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web && pnpm dlx shadcn@latest add accordion
```

- [ ] **Step 2: Verify the component was created**

Run: `ls apps/web/src/components/ui/accordion.tsx`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/accordion.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add shadcn accordion component for FAQ section"
```

---

## Task 2: Page Views Database Schema

**Files:**
- Create: `packages/db/src/schema/pageViews.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create the pageViews schema file**

Create `packages/db/src/schema/pageViews.ts`:

```typescript
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("page_views_created_at_idx").on(table.createdAt),
    index("page_views_path_created_at_idx").on(table.path, table.createdAt),
    index("page_views_dedup_idx").on(
      table.visitorHash,
      table.path,
      table.createdAt
    ),
  ]
);

export const pageViewsDaily = pgTable(
  "page_views_daily",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    date: date("date").notNull(),
    views: integer("views").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull(),
    topReferrer: text("top_referrer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("page_views_daily_path_date_idx").on(table.path, table.date),
  ]
);
```

- [ ] **Step 2: Export from schema index**

Edit `packages/db/src/schema/index.ts` — add this line at the end:

```typescript
export * from "./pageViews";
```

The file should now read:
```typescript
export * from "./auth";
export * from "./organizations";
export * from "./sites";
export * from "./scans";
export * from "./reports";
export * from "./pageViews";
```

- [ ] **Step 3: Generate and run the migration**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm --filter db drizzle-kit generate
```

Then push to the database:
```bash
pnpm --filter db drizzle-kit push
```

If the project uses `drizzle-kit push` directly (check `packages/db/package.json` for scripts), use the appropriate command. The goal is to create the `page_views` and `page_views_daily` tables in Neon.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/pageViews.ts packages/db/src/schema/index.ts
git commit -m "feat: add page_views and page_views_daily schema for visitor analytics"
```

---

## Task 3: Tracking API Endpoint

**Files:**
- Create: `apps/web/src/app/api/track/route.ts`
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Add /api/track to public paths in middleware**

Edit `apps/web/src/middleware.ts` — add `"/api/track"` to the `publicPaths` array:

```typescript
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
];
```

- [ ] **Step 2: Create the tracking API route**

Create `apps/web/src/app/api/track/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db, sql } from "@access-audit/db";
import { pageViews } from "@access-audit/db/schema";

function hashVisitor(ip: string): string {
  const today = new Date().toISOString().split("T")[0];
  const salt = `${process.env.CRON_SECRET ?? "dev-salt"}-${today}`;
  return createHash("sha256").update(`${ip}-${salt}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const path = typeof body.path === "string" ? body.path : "/";
    const referrer = typeof body.referrer === "string" ? body.referrer : null;

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const visitorHash = hashVisitor(ip);
    const userAgent = request.headers.get("user-agent") ?? null;

    // Deduplicate: skip if same visitor+path within last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await db
      .select({ id: pageViews.id })
      .from(pageViews)
      .where(
        sql`${pageViews.visitorHash} = ${visitorHash} AND ${pageViews.path} = ${path} AND ${pageViews.createdAt} > ${oneHourAgo}`
      )
      .limit(1);

    if (existing.length > 0) {
      return new NextResponse(null, { status: 204 });
    }

    await db.insert(pageViews).values({
      path,
      visitorHash,
      referrer,
      userAgent,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Fail silently — analytics should never break the user experience
    return new NextResponse(null, { status: 204 });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/track/route.ts apps/web/src/middleware.ts
git commit -m "feat: add privacy-first page view tracking API endpoint"
```

---

## Task 4: TrackPageview Client Component

**Files:**
- Create: `apps/web/src/components/marketing/track-pageview.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/marketing/track-pageview.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function TrackPageview() {
  const pathname = usePathname();

  useEffect(() => {
    const data = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", data);
    } else {
      fetch("/api/track", {
        method: "POST",
        body: data,
        keepalive: true,
      }).catch(() => {
        // Silently fail — never block the page
      });
    }
  }, [pathname]);

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/marketing/track-pageview.tsx
git commit -m "feat: add TrackPageview client component with sendBeacon"
```

---

## Task 5: Analytics Digest Email

**Files:**
- Create: `apps/web/src/lib/analytics-email.ts`

- [ ] **Step 1: Create the analytics email module**

Create `apps/web/src/lib/analytics-email.ts`:

```typescript
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "AccessAudit <noreply@accessaudit.com>";

interface DailyAnalytics {
  date: string;
  totalViews: number;
  uniqueVisitors: number;
  topPages: { path: string; views: number }[];
  topReferrers: { referrer: string; count: number }[];
  previousDayViews: number;
  previousDayUnique: number;
}

function formatChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "New!" : "—";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return "→ 0%";
}

export async function sendAnalyticsDigest(
  to: string,
  data: DailyAnalytics
) {
  const viewsChange = formatChange(data.totalViews, data.previousDayViews);
  const uniqueChange = formatChange(
    data.uniqueVisitors,
    data.previousDayUnique
  );

  const topPagesHtml = data.topPages
    .map(
      (p) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${p.path}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${p.views}</td></tr>`
    )
    .join("");

  const topReferrersHtml = data.topReferrers
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${r.referrer}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;">${r.count}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">AccessAudit Daily Analytics</h1>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px;">${data.date}</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:0;">
        <div style="display:flex;gap:24px;margin-bottom:24px;">
          <div style="flex:1;background:#f9fafb;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#111827;">${data.totalViews}</div>
            <div style="font-size:12px;color:#6b7280;">Page Views</div>
            <div style="font-size:12px;color:${viewsChange.startsWith("↑") ? "#059669" : viewsChange.startsWith("↓") ? "#dc2626" : "#6b7280"};margin-top:4px;">${viewsChange} vs yesterday</div>
          </div>
          <div style="flex:1;background:#f9fafb;padding:16px;border-radius:8px;text-align:center;">
            <div style="font-size:28px;font-weight:700;color:#111827;">${data.uniqueVisitors}</div>
            <div style="font-size:12px;color:#6b7280;">Unique Visitors</div>
            <div style="font-size:12px;color:${uniqueChange.startsWith("↑") ? "#059669" : uniqueChange.startsWith("↓") ? "#dc2626" : "#6b7280"};margin-top:4px;">${uniqueChange} vs yesterday</div>
          </div>
        </div>

        ${
          data.topPages.length > 0
            ? `<h3 style="font-size:14px;color:#374151;margin:0 0 8px;">Top Pages</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <thead><tr><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Page</th><th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Views</th></tr></thead>
          <tbody>${topPagesHtml}</tbody>
        </table>`
            : ""
        }

        ${
          data.topReferrers.length > 0
            ? `<h3 style="font-size:14px;color:#374151;margin:0 0 8px;">Top Referrers</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr><th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Source</th><th style="padding:6px 12px;text-align:right;border-bottom:2px solid #e5e7eb;">Visits</th></tr></thead>
          <tbody>${topReferrersHtml}</tbody>
        </table>`
            : ""
        }
      </div>
      <div style="background:#f9fafb;padding:16px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by AccessAudit Analytics</p>
      </div>
    </div>
  `;

  const subject = `AccessAudit Daily Analytics — ${data.date}`;

  if (!resend) {
    console.log(`[DEV] Analytics digest to ${to}: ${subject}`);
    console.log(
      `Views: ${data.totalViews}, Unique: ${data.uniqueVisitors}`
    );
    return;
  }

  await resend.emails.send({ from: FROM, to, subject, html });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/analytics-email.ts
git commit -m "feat: add analytics daily digest email template"
```

---

## Task 6: Analytics Cron Endpoint

**Files:**
- Create: `apps/web/src/app/api/cron/analytics/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add ANALYTICS_ADMIN_EMAIL to .env.example**

Append to `.env.example`:
```
ANALYTICS_ADMIN_EMAIL=
```

- [ ] **Step 2: Create the analytics cron route**

Create `apps/web/src/app/api/cron/analytics/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db, sql, eq, and } from "@access-audit/db";
import { pageViews, pageViewsDaily } from "@access-audit/db/schema";
import { sendAnalyticsDigest } from "@/lib/analytics-email";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ANALYTICS_ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "ANALYTICS_ADMIN_EMAIL not configured" },
      { status: 500 }
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]!;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split("T")[0]!;
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // --- Step 1: Aggregate yesterday's raw data into page_views_daily ---

  const yesterdayStats = await db
    .select({
      path: pageViews.path,
      views: sql<number>`count(*)::int`,
      uniqueVisitors: sql<number>`count(distinct ${pageViews.visitorHash})::int`,
    })
    .from(pageViews)
    .where(
      and(
        sql`${pageViews.createdAt} >= ${yesterday}`,
        sql`${pageViews.createdAt} < ${now}`
      )
    )
    .groupBy(pageViews.path);

  for (const stat of yesterdayStats) {
    // Get top referrer for this path
    const topRef = await db
      .select({
        referrer: pageViews.referrer,
        count: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(
        and(
          sql`${pageViews.createdAt} >= ${yesterday}`,
          sql`${pageViews.createdAt} < ${now}`,
          eq(pageViews.path, stat.path),
          sql`${pageViews.referrer} IS NOT NULL AND ${pageViews.referrer} != ''`
        )
      )
      .groupBy(pageViews.referrer)
      .orderBy(sql`count(*) desc`)
      .limit(1);

    // Upsert into page_views_daily
    await db
      .insert(pageViewsDaily)
      .values({
        path: stat.path,
        date: yesterdayStr,
        views: stat.views,
        uniqueVisitors: stat.uniqueVisitors,
        topReferrer: topRef[0]?.referrer ?? null,
      })
      .onConflictDoUpdate({
        target: [pageViewsDaily.path, pageViewsDaily.date],
        set: {
          views: stat.views,
          uniqueVisitors: stat.uniqueVisitors,
          topReferrer: topRef[0]?.referrer ?? null,
        },
      });
  }

  // --- Step 2: Gather data for email ---

  const totalViews = yesterdayStats.reduce((sum, s) => sum + s.views, 0);
  const totalUnique = yesterdayStats.reduce(
    (sum, s) => sum + s.uniqueVisitors,
    0
  );

  const topPages = [...yesterdayStats]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((s) => ({ path: s.path, views: s.views }));

  // Top referrers across all pages
  const topReferrersRaw = await db
    .select({
      referrer: pageViews.referrer,
      count: sql<number>`count(*)::int`,
    })
    .from(pageViews)
    .where(
      and(
        sql`${pageViews.createdAt} >= ${yesterday}`,
        sql`${pageViews.createdAt} < ${now}`,
        sql`${pageViews.referrer} IS NOT NULL AND ${pageViews.referrer} != ''`
      )
    )
    .groupBy(pageViews.referrer)
    .orderBy(sql`count(*) desc`)
    .limit(3);

  const topReferrers = topReferrersRaw.map((r) => ({
    referrer: r.referrer ?? "Direct",
    count: r.count,
  }));

  // Previous day totals (from page_views_daily)
  const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0]!;
  const prevDayAgg = await db
    .select({
      totalViews: sql<number>`coalesce(sum(${pageViewsDaily.views}), 0)::int`,
      totalUnique: sql<number>`coalesce(sum(${pageViewsDaily.uniqueVisitors}), 0)::int`,
    })
    .from(pageViewsDaily)
    .where(eq(pageViewsDaily.date, twoDaysAgoStr));

  const previousDayViews = prevDayAgg[0]?.totalViews ?? 0;
  const previousDayUnique = prevDayAgg[0]?.totalUnique ?? 0;

  // --- Step 3: Send digest email ---

  await sendAnalyticsDigest(adminEmail, {
    date: yesterdayStr,
    totalViews: totalViews,
    uniqueVisitors: totalUnique,
    topPages,
    topReferrers,
    previousDayViews,
    previousDayUnique,
  });

  // --- Step 4: Purge raw data older than 90 days ---

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const deleteResult = await db
    .delete(pageViews)
    .where(sql`${pageViews.createdAt} < ${ninetyDaysAgo}`);

  return NextResponse.json({
    success: true,
    date: yesterdayStr,
    totalViews,
    uniqueVisitors: totalUnique,
    topPages: topPages.length,
    emailSent: true,
    purgedOlderThan: ninetyDaysAgo.toISOString(),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/cron/analytics/route.ts .env.example
git commit -m "feat: add daily analytics cron with aggregation, digest email, and 90-day purge"
```

---

## Task 7: Extract Shared PricingCards Component

**Files:**
- Create: `apps/web/src/components/marketing/pricing-cards.tsx`
- Modify: `apps/web/src/app/pricing/page.tsx`

- [ ] **Step 1: Create the shared PricingCards component**

Create `apps/web/src/components/marketing/pricing-cards.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { PLANS, type PlanKey } from "@access-audit/db";
import { toast } from "sonner";
import { useState } from "react";

const DISPLAY_PLANS: PlanKey[] = ["starter", "agency", "pro"];

const FEATURE_ROWS = [
  { label: "AI fix suggestions", key: "aiFixSuggestions" },
  { label: "Client dashboard", key: "clientDashboard" },
  { label: "Compliance badge", key: "complianceBadge" },
  { label: "API access", key: "apiAccess" },
  { label: "White-label", key: "whiteLabel" },
] as const;

interface PricingCardsProps {
  showHeader?: boolean;
}

export function PricingCards({ showHeader = true }: PricingCardsProps) {
  const { data: session } = useSession();
  const orgQuery = trpc.organization.getOrg.useQuery(undefined, {
    enabled: !!session,
  });
  const currentPlan = orgQuery.data?.settings?.plan ?? "trial";
  const [loading, setLoading] = useState<string | null>(null);

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "true";

  async function handleSelectPlan(slug: string) {
    if (!session) {
      window.location.href = "/signup";
      return;
    }

    setLoading(slug);
    try {
      const res = await fetch("/api/auth/dodopayments/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();

      if (!res.ok || !data?.url) {
        toast.error("Failed to start checkout. Please try again.");
        return;
      }

      window.location.href = data.url;
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {showHeader && (
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            {isUpgrade ? "Choose Your Plan" : "Simple, Transparent Pricing"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isUpgrade
              ? "Select the plan that fits your needs."
              : "Start with a 7-day free trial. No credit card required."}
          </p>
        </div>
      )}

      <div className={`grid gap-6 md:grid-cols-3 ${showHeader ? "mt-12" : ""}`}>
        {DISPLAY_PLANS.map((key) => {
          const plan = PLANS[key];
          const isCurrent = currentPlan === key;
          const isPopular = key === "agency";

          return (
            <Card
              key={key}
              className={`relative ${
                isPopular ? "border-2 border-primary shadow-lg" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold">
                    ${(plan.price / 100).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.siteQuota === -1
                      ? "Unlimited sites"
                      : `Up to ${plan.siteQuota} sites`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.pagesPerSite} pages per site
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.scanFrequency.charAt(0).toUpperCase() +
                      plan.scanFrequency.slice(1)}{" "}
                    scans
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.teamMembers} team member
                    {plan.teamMembers > 1 ? "s" : ""}
                  </li>
                  {FEATURE_ROWS.map((feat) => (
                    <li key={feat.key} className="flex items-center gap-2">
                      {plan.features[feat.key] ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40" />
                      )}
                      <span
                        className={
                          !plan.features[feat.key]
                            ? "text-muted-foreground/60"
                            : ""
                        }
                      >
                        {feat.label}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.features.pdfReports === "basic"
                      ? "Basic PDF reports"
                      : plan.features.pdfReports === "branded"
                        ? "Branded PDF reports"
                        : "Branded + VPAT reports"}
                  </li>
                </ul>

                {isCurrent ? (
                  <Button className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : session ? (
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan.dodoSlug)}
                    disabled={loading === plan.dodoSlug}
                  >
                    {loading === plan.dodoSlug
                      ? "Redirecting..."
                      : `${isUpgrade ? "Switch to" : "Get"} ${plan.name}`}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    asChild
                  >
                    <a href="/signup">Start Free Trial</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update /pricing page to use the shared component**

Replace the entire content of `apps/web/src/app/pricing/page.tsx` with:

```tsx
"use client";

import { PricingCards } from "@/components/marketing/pricing-cards";

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <PricingCards showHeader={true} />
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/marketing/pricing-cards.tsx apps/web/src/app/pricing/page.tsx
git commit -m "refactor: extract PricingCards into shared component"
```

---

## Task 8: MarketingNav Component

**Files:**
- Create: `apps/web/src/components/marketing/marketing-nav.tsx`

- [ ] **Step 1: Create the marketing nav**

Create `apps/web/src/components/marketing/marketing-nav.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/80 backdrop-blur-lg border-b border-border/50 shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold">
            A
          </div>
          <span className="text-lg font-bold text-foreground">
            AccessAudit
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-muted-foreground"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="border-t bg-white/95 backdrop-blur-lg md:hidden">
          <div className="flex flex-col gap-4 p-6">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-muted-foreground"
              >
                {link.label}
              </a>
            ))}
            <hr className="border-border" />
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-2 text-center text-sm font-semibold text-white"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/marketing/marketing-nav.tsx
git commit -m "feat: add MarketingNav with sticky scroll effect and mobile menu"
```

---

## Task 9: MarketingFooter Component

**Files:**
- Create: `apps/web/src/components/marketing/marketing-footer.tsx`

- [ ] **Step 1: Create the marketing footer**

Create `apps/web/src/components/marketing/marketing-footer.tsx`:

```tsx
import Link from "next/link";

const productLinks = [
  { href: "#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold">
              A
            </div>
            <span className="text-lg font-bold text-foreground">
              AccessAudit
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built with accessibility in mind.
          </p>
        </div>

        {/* Product */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">
            Product
          </h4>
          <ul className="space-y-2">
            {productLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">Legal</h4>
          <ul className="space-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Connect */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-foreground">
            Connect
          </h4>
          <ul className="space-y-2">
            <li>
              <a
                href="https://twitter.com/accessaudit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Twitter / X
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} AccessAudit. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/marketing/marketing-footer.tsx
git commit -m "feat: add MarketingFooter with product, legal, and connect columns"
```

---

## Task 10: FAQ Accordion Component

**Files:**
- Create: `apps/web/src/components/marketing/faq-accordion.tsx`

- [ ] **Step 1: Create the FAQ component**

Create `apps/web/src/components/marketing/faq-accordion.tsx`:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    q: "How accurate is the scanning?",
    a: "We use axe-core, the industry-standard accessibility testing engine used by Deque, Google, and Microsoft. It catches real WCAG violations with minimal false positives — the same engine that powers the Chrome DevTools accessibility audit.",
  },
  {
    q: "Does this make my site ADA compliant?",
    a: "AccessAudit identifies WCAG violations and provides AI-generated fix code for each issue. Full compliance requires implementing the fixes. We're a diagnostic and remediation tool, not a legal guarantee — but we give you everything you need to get compliant.",
  },
  {
    q: "What WCAG standards do you test?",
    a: "WCAG 2.1 Level AA — the standard referenced by ADA Title II and the most widely adopted benchmark for web accessibility. This covers contrast ratios, keyboard navigation, screen reader compatibility, form labels, and more.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — 7 days on the Agency plan with full access to all features, no credit card required. Scan sites, generate reports, invite your team, and see the value before you pay.",
  },
  {
    q: "How does white-label work?",
    a: "Agency and Pro plans get a branded subdomain (your-name.accessaudit.com) with your logo and brand colors. Share reports and compliance dashboards with your clients under your own brand — they never see AccessAudit.",
  },
  {
    q: "Is my data secure?",
    a: "All data is encrypted in transit (TLS) and at rest. We host on Vercel (SOC 2 compliant) with Neon PostgreSQL (SOC 2 compliant). We never store raw IP addresses, use no tracking cookies, and follow privacy-by-design principles.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing settings at any time — no contracts, no cancellation fees. Your data is preserved and you can reactivate whenever you want.",
  },
];

export function FaqAccordion() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {FAQ_ITEMS.map((item, i) => (
        <AccordionItem key={i} value={`faq-${i}`}>
          <AccordionTrigger className="text-left text-base font-medium">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground leading-relaxed">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/marketing/faq-accordion.tsx
git commit -m "feat: add FAQ accordion component with 7 launch questions"
```

---

## Task 11: Marketing Layout Refactor

**Files:**
- Modify: `apps/web/src/app/(marketing)/layout.tsx`

- [ ] **Step 1: Replace the marketing layout**

Replace the entire content of `apps/web/src/app/(marketing)/layout.tsx` with:

```tsx
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { TrackPageview } from "@/components/marketing/track-pageview";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <main className="pt-16">{children}</main>
      <MarketingFooter />
      <TrackPageview />
    </div>
  );
}
```

Note: `pt-16` offsets for the fixed navbar height (h-16 = 4rem = 64px).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(marketing)/layout.tsx"
git commit -m "refactor: replace marketing layout with MarketingNav + MarketingFooter + TrackPageview"
```

---

## Task 12: Landing Page — Full Rewrite

**Files:**
- Modify: `apps/web/src/app/(marketing)/page.tsx`

- [ ] **Step 1: Rewrite the landing page with all 9 sections**

Replace the entire content of `apps/web/src/app/(marketing)/page.tsx` with:

```tsx
import {
  Sparkles,
  Shield,
  FileText,
  Globe,
  BadgeCheck,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { FaqAccordion } from "@/components/marketing/faq-accordion";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Fix Suggestions",
    description:
      "Get copy-paste code fixes for every violation, powered by Claude AI. Stop guessing — get actionable fixes instantly.",
  },
  {
    icon: Shield,
    title: "WCAG 2.1 AA Scanning",
    description:
      "Industry-standard axe-core engine scans up to 200 pages per site. The same engine trusted by Google and Microsoft.",
  },
  {
    icon: FileText,
    title: "Branded PDF Reports",
    description:
      "Deliver professional compliance reports with your agency's logo and colors. Impress clients with polished deliverables.",
  },
  {
    icon: Globe,
    title: "White-Label Dashboard",
    description:
      "Give clients their own branded portal at your-agency.accessaudit.com. Your brand, your clients, zero AccessAudit branding.",
  },
  {
    icon: BadgeCheck,
    title: "Compliance Badges",
    description:
      "Embed dynamic SVG badges that prove your clients' sites are compliant. Builds trust and demonstrates value.",
  },
  {
    icon: Users,
    title: "Team Management",
    description:
      "Invite your team with role-based access: owner, admin, member, viewer. Collaborate seamlessly across your agency.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Add Your Site",
    description:
      "Enter a URL and we automatically crawl and discover pages. Set scan frequency — hourly, daily, or weekly.",
  },
  {
    number: "02",
    title: "We Scan & Analyze",
    description:
      "axe-core checks every page for WCAG violations. Claude AI generates fix code and plain-English explanations for each issue.",
  },
  {
    number: "03",
    title: "Deliver to Clients",
    description:
      "PDF reports, branded dashboards, compliance badges — all ready to share. White-label everything under your agency brand.",
  },
];

const STATS = [
  {
    value: "95.9%",
    label: "of websites are non-compliant",
    source: "WebAIM Million 2025",
  },
  {
    value: "37%",
    label: "surge in ADA lawsuits in H1 2025",
    source: "UsableNet Report",
  },
  {
    value: "Apr 2026",
    label: "ADA Title II compliance deadline",
    source: "Department of Justice",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/50 to-purple-50/50" />
        <div className="absolute top-0 right-0 -z-0 h-[500px] w-[500px] rounded-full bg-purple-100/40 blur-3xl" />
        <div className="absolute bottom-0 left-0 -z-0 h-[400px] w-[400px] rounded-full bg-blue-100/40 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-medium text-purple-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Accessibility Compliance
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Your clients&apos; websites.
              <br />
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                Fully compliant.
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Scan websites for WCAG violations, get AI-powered fix suggestions,
              and deliver branded compliance reports — all under your agency
              brand.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/30 hover:opacity-95"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-8 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                See How It Works
              </a>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              7-day free trial &middot; No credit card required
            </p>
          </div>

          {/* Dashboard preview mockup */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-xl border bg-white/80 p-2 shadow-2xl shadow-purple-500/10 backdrop-blur">
              <div className="rounded-lg border bg-gradient-to-br from-slate-50 to-white p-6">
                {/* Mock dashboard header */}
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
                    <div>
                      <div className="h-3 w-32 rounded bg-slate-200" />
                      <div className="mt-1.5 h-2 w-20 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="rounded-md bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      92% Compliant
                    </div>
                  </div>
                </div>
                {/* Mock stat cards */}
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {[
                    { label: "Sites", value: "12" },
                    { label: "Avg. Score", value: "87%" },
                    { label: "Violations", value: "34" },
                    { label: "Fixed", value: "156" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border bg-white p-3 text-center"
                    >
                      <div className="text-lg font-bold text-foreground">
                        {stat.value}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mock violations list */}
                <div className="mt-4 space-y-2">
                  {[
                    { rule: "color-contrast", impact: "Serious", page: "/about" },
                    { rule: "image-alt", impact: "Critical", page: "/home" },
                    { rule: "link-name", impact: "Moderate", page: "/contact" },
                  ].map((v) => (
                    <div
                      key={v.rule + v.page}
                      className="flex items-center justify-between rounded-lg border bg-white px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground/30" />
                        <div>
                          <span className="text-sm font-medium">
                            {v.rule}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {v.page}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          v.impact === "Critical"
                            ? "bg-red-100 text-red-700"
                            : v.impact === "Serious"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {v.impact}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== URGENCY STATS BAR ===== */}
      <section className="border-y bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3">
          {STATS.map((stat) => (
            <div key={stat.value} className="text-center">
              <div className="text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent sm:text-4xl">
                {stat.value}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {stat.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stat.source}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES GRID ===== */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything agencies need to{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                deliver compliance
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From scanning to reporting, AccessAudit handles the entire
              accessibility workflow.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border bg-white p-6 transition-all hover:border-purple-200 hover:shadow-lg hover:shadow-purple-500/5"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-600/10 text-purple-600">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section
        id="how-it-works"
        className="scroll-mt-20 border-y bg-gradient-to-br from-slate-50 to-purple-50/30"
      >
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps to{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                full compliance
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Get from zero to compliant in minutes, not months.
            </p>
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {STEPS.map((step, idx) => (
              <div key={step.number} className="relative">
                {/* Connector line (desktop only) */}
                {idx < STEPS.length - 1 && (
                  <div className="absolute top-12 left-full hidden h-0.5 w-8 bg-gradient-to-r from-purple-300 to-transparent lg:block" />
                )}
                <div className="rounded-xl border bg-white p-6 shadow-sm">
                  <div className="mb-4 text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                    {step.number}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="scroll-mt-20">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple,{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                transparent pricing
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start with a 7-day free trial. No credit card required.
            </p>
          </div>
          <div className="mt-12">
            <PricingCards showHeader={false} />
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section
        id="faq"
        className="scroll-mt-20 border-y bg-gradient-to-br from-slate-50 to-blue-50/30"
      >
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                questions
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything you need to know about AccessAudit.
            </p>
          </div>
          <div className="mt-12">
            <FaqAccordion />
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />

        <div className="relative mx-auto max-w-4xl px-6 py-20 text-center sm:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to make your clients&apos; sites compliant?
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            Start your free 7-day trial. No credit card required.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-purple-700 shadow-lg transition-all hover:shadow-xl hover:bg-purple-50"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(marketing)/page.tsx"
git commit -m "feat: build production landing page with hero, stats, features, pricing, FAQ, and CTA"
```

---

## Task 13: SEO — Root Layout Metadata

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Update root layout with comprehensive metadata**

Replace the entire content of `apps/web/src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "AccessAudit — ADA Accessibility Compliance for Agencies",
    template: "%s | AccessAudit",
  },
  description:
    "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients. Start free.",
  keywords: [
    "ADA compliance",
    "WCAG",
    "accessibility audit",
    "web accessibility",
    "agency tools",
    "compliance reports",
    "axe-core",
    "WCAG 2.1",
  ],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://accessaudit.com"
  ),
  openGraph: {
    type: "website",
    siteName: "AccessAudit",
    title: "AccessAudit — ADA Accessibility Compliance for Agencies",
    description:
      "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessAudit — ADA Accessibility Compliance for Agencies",
    description:
      "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: add comprehensive SEO metadata to root layout"
```

---

## Task 14: SEO — OG Image, Sitemap, Robots

**Files:**
- Create: `apps/web/src/app/opengraph-image.tsx`
- Create: `apps/web/src/app/sitemap.ts`
- Create: `apps/web/src/app/robots.ts`

- [ ] **Step 1: Create the dynamic OG image**

Create `apps/web/src/app/opengraph-image.tsx`:

```tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AccessAudit — ADA Accessibility Compliance for Agencies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b82f6, #7c3aed)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              fontWeight: 800,
              color: "white",
            }}
          >
            A
          </div>
          <span
            style={{
              fontSize: "40px",
              fontWeight: 800,
              color: "white",
            }}
          >
            AccessAudit
          </span>
        </div>
        <div
          style={{
            fontSize: "28px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            maxWidth: "700px",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          ADA Accessibility Compliance for Agencies
        </div>
        <div
          style={{
            marginTop: "16px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          Scan &middot; Fix &middot; Report &middot; Certify
        </div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Create the sitemap**

Create `apps/web/src/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://accessaudit.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
```

- [ ] **Step 3: Create the robots.txt**

Create `apps/web/src/app/robots.ts`:

```typescript
import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://accessaudit.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/sites",
          "/settings",
          "/team",
          "/onboarding",
          "/api",
          "/wl",
          "/share",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/opengraph-image.tsx apps/web/src/app/sitemap.ts apps/web/src/app/robots.ts
git commit -m "feat: add OG image generation, sitemap, and robots.txt"
```

---

## Task 15: JSON-LD Structured Data

**Files:**
- Modify: `apps/web/src/app/(marketing)/page.tsx`

- [ ] **Step 1: Add JSON-LD script to the landing page**

At the very top of the `HomePage` component return (inside the outer `<div>`), before the hero section comment, add:

```tsx
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "AccessAudit",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports.",
            offers: [
              {
                "@type": "Offer",
                name: "Starter",
                price: "49",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
              },
              {
                "@type": "Offer",
                name: "Agency",
                price: "199",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
              },
              {
                "@type": "Offer",
                name: "Pro",
                price: "499",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
              },
            ],
          }),
        }}
      />
```

Insert this immediately after `<div>` and before `{/* ===== HERO ===== */}`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(marketing)/page.tsx"
git commit -m "feat: add JSON-LD structured data for SoftwareApplication schema"
```

---

## Task 16: Custom 404 Page

**Files:**
- Create: `apps/web/src/app/not-found.tsx`

- [ ] **Step 1: Create the 404 page**

Create `apps/web/src/app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          404
        </h1>
        <h2 className="mt-4 text-2xl font-bold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Go back home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/not-found.tsx
git commit -m "feat: add custom 404 page with gradient styling"
```

---

## Task 17: Custom Error Page

**Files:**
- Create: `apps/web/src/app/error.tsx`

- [ ] **Step 1: Create the error boundary page**

Create `apps/web/src/app/error.tsx`:

```tsx
"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-8xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          500
        </h1>
        <h2 className="mt-4 text-2xl font-bold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-2 text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/error.tsx
git commit -m "feat: add custom error boundary page with retry and gradient styling"
```

---

## Task 18: Generated Favicon

**Files:**
- Create: `apps/web/src/app/icon.tsx`

- [ ] **Step 1: Create the generated favicon**

Create `apps/web/src/app/icon.tsx`:

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          background: "linear-gradient(135deg, #3b82f6, #7c3aed)",
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          fontWeight: 800,
          color: "white",
        }}
      >
        A
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/icon.tsx
git commit -m "feat: add generated favicon with gradient brand colors"
```

---

## Task 19: Add .superpowers to .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .superpowers directory to .gitignore**

Append to `.gitignore`:

```
# Superpowers brainstorm sessions
.superpowers/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to gitignore"
```

---

## Task 20: Final TypeScript Verification and Phase Completion

- [ ] **Step 1: Full TypeScript check**

```bash
pnpm --filter web exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 2: Update docs/phases.md to mark Phase 8 complete**

Edit `docs/phases.md` — change Phase 8 status from `Not Started` to `Complete`:

```markdown
| 8 | Landing page + launch prep | Complete | Last — ship when product works |
```

- [ ] **Step 3: Commit**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 8 Landing page + launch prep as complete"
```
