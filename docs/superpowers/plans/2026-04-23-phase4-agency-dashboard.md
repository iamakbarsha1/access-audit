# Phase 4: Agency Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core agency dashboard with 4 pages/views, 1 page enhancement, 6 new components, and 1 new tRPC endpoint — giving agencies full visibility into their sites' accessibility compliance.

**Architecture:** Client-side React pages using existing tRPC routers for data fetching. One new `dashboard.stats` tRPC endpoint aggregates metrics. Scan progress uses polling via `scans.getProgress` every 3 seconds. Violation details display in a slide-over Sheet panel. All pages are `"use client"` components following the existing pattern.

**Tech Stack:** Next.js 15 App Router, tRPC, shadcn/ui, Tailwind CSS, Drizzle ORM, lucide-react icons

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/components/dashboard/stat-card.tsx` | Create | Reusable metric card (label, value, icon, optional color) |
| `apps/web/src/components/dashboard/scan-button.tsx` | Create | Trigger scan + poll progress with inline status |
| `apps/web/src/components/dashboard/scan-history.tsx` | Create | Scan history table with status badges and duration |
| `apps/web/src/components/dashboard/violation-list.tsx` | Create | Filterable violation rows with impact/status filters |
| `apps/web/src/components/dashboard/violation-sheet.tsx` | Create | Slide-over panel with AI explanation, fix code, actions |
| `apps/web/src/components/dashboard/site-header.tsx` | Create | Site name, URL, compliance score, scan button |
| `apps/web/src/trpc/routers/dashboard.ts` | Create | dashboard.stats aggregation endpoint |
| `apps/web/src/trpc/routers/_app.ts` | Modify | Register dashboardRouter |
| `apps/web/src/app/(dashboard)/page.tsx` | Modify | Replace redirect with real dashboard home |
| `apps/web/src/app/(dashboard)/sites/page.tsx` | Modify | Add scan button, last scan info, click-to-navigate |
| `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx` | Create | Tabbed site detail page |
| `apps/web/src/components/dashboard/topbar.tsx` | Modify | Add dynamic title for site detail pages |

---

## Task 1: StatCard Component

**Files:**
- Create: `apps/web/src/components/dashboard/stat-card.tsx`

- [ ] **Step 1: Create the StatCard component**

```tsx
// apps/web/src/components/dashboard/stat-card.tsx
import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/stat-card.tsx
git commit -m "feat(web): add StatCard reusable metric component"
```

---

## Task 2: Dashboard Stats tRPC Router

**Files:**
- Create: `apps/web/src/trpc/routers/dashboard.ts`
- Modify: `apps/web/src/trpc/routers/_app.ts` (line 1-18)

- [ ] **Step 1: Create the dashboard router**

```tsx
// apps/web/src/trpc/routers/dashboard.ts
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { sites, scans, violations } from "@access-audit/db/schema";
import { eq, and, sql, count } from "@access-audit/db";

export const dashboardRouter = createTRPCRouter({
  stats: orgProcedure("viewer").query(async ({ ctx }) => {
    // Get all active sites for this org
    const orgSites = await ctx.db
      .select({
        id: sites.id,
        complianceScore: sites.complianceScore,
      })
      .from(sites)
      .where(
        and(
          eq(sites.organizationId, ctx.orgId),
          eq(sites.status, "active")
        )
      );

    const totalSites = orgSites.length;

    // Calculate average compliance score (only sites that have been scanned)
    const scannedSites = orgSites.filter((s) => s.complianceScore !== null);
    const avgComplianceScore =
      scannedSites.length > 0
        ? Math.round(
            scannedSites.reduce((sum, s) => sum + s.complianceScore!, 0) /
              scannedSites.length
          )
        : null;

    if (totalSites === 0) {
      return {
        totalSites: 0,
        avgComplianceScore: null,
        totalOpenViolations: 0,
        criticalViolations: 0,
      };
    }

    const siteIds = orgSites.map((s) => s.id);

    // Get the latest completed scan for each site to count current violations
    const latestScans = await ctx.db
      .select({ id: scans.id })
      .from(scans)
      .where(
        and(
          sql`${scans.siteId} IN ${siteIds}`,
          eq(scans.status, "completed")
        )
      )
      .orderBy(sql`${scans.createdAt} DESC`);

    if (latestScans.length === 0) {
      return {
        totalSites,
        avgComplianceScore,
        totalOpenViolations: 0,
        criticalViolations: 0,
      };
    }

    const scanIds = latestScans.map((s) => s.id);

    // Count open violations across latest scans
    const violationCounts = await ctx.db
      .select({
        total: count(),
        critical: count(
          sql`CASE WHEN ${violations.impact} = 'critical' AND ${violations.status} = 'open' THEN 1 END`
        ),
      })
      .from(violations)
      .where(
        and(
          sql`${violations.scanId} IN ${scanIds}`,
          eq(violations.status, "open")
        )
      );

    return {
      totalSites,
      avgComplianceScore,
      totalOpenViolations: violationCounts[0]?.total ?? 0,
      criticalViolations: violationCounts[0]?.critical ?? 0,
    };
  }),
});
```

- [ ] **Step 2: Register dashboard router in app router**

In `apps/web/src/trpc/routers/_app.ts`, add the import and registration:

```tsx
// Add import at top:
import { dashboardRouter } from "./dashboard";

// Add to createTRPCRouter object:
export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  members: membersRouter,
  sites: sitesRouter,
  scans: scansRouter,
  violations: violationsRouter,
  dashboard: dashboardRouter,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/trpc/routers/dashboard.ts apps/web/src/trpc/routers/_app.ts
git commit -m "feat(web): add dashboard.stats tRPC endpoint with org-scoped aggregates"
```

---

## Task 3: ScanButton Component

**Files:**
- Create: `apps/web/src/components/dashboard/scan-button.tsx`

This component triggers a scan and polls for progress every 3 seconds until completed or failed.

- [ ] **Step 1: Create the ScanButton component**

```tsx
// apps/web/src/components/dashboard/scan-button.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

interface ScanButtonProps {
  siteId: string;
  size?: "default" | "sm" | "lg" | "icon";
  onScanComplete?: () => void;
}

export function ScanButton({ siteId, size = "sm", onScanComplete }: ScanButtonProps) {
  const utils = trpc.useUtils();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("Queued...");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startScan = trpc.scans.startScan.useMutation({
    onSuccess: (scan) => {
      setActiveScanId(scan.id);
      setProgress("Queued...");
      toast.success("Scan started");
    },
    onError: (err) => toast.error(err.message),
  });

  const pollProgress = useCallback(async () => {
    if (!activeScanId) return;
    try {
      const data = await utils.client.scans.getProgress.query({ scanId: activeScanId });
      if (data.status === "processing") {
        const scanned = data.pagesScanned ?? 0;
        const found = data.pagesFound ?? 0;
        setProgress(`Scanning ${scanned}/${found} pages...`);
      } else if (data.status === "completed") {
        setActiveScanId(null);
        setProgress("");
        toast.success(`Scan complete — score: ${data.complianceScore ?? "N/A"}%`);
        utils.scans.listBySite.invalidate();
        utils.sites.list.invalidate();
        utils.dashboard.stats.invalidate();
        onScanComplete?.();
      } else if (data.status === "failed") {
        setActiveScanId(null);
        setProgress("");
        toast.error(`Scan failed: ${data.errorMessage ?? "Unknown error"}`);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [activeScanId, utils, onScanComplete]);

  useEffect(() => {
    if (activeScanId) {
      intervalRef.current = setInterval(pollProgress, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [activeScanId, pollProgress]);

  const isScanning = startScan.isPending || activeScanId !== null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size={size}
        variant="outline"
        onClick={() => startScan.mutate({ siteId })}
        disabled={isScanning}
      >
        {isScanning ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            {progress}
          </>
        ) : (
          <>
            <Play className="mr-1 h-4 w-4" />
            Scan
          </>
        )}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/scan-button.tsx
git commit -m "feat(web): add ScanButton component with polling progress"
```

---

## Task 4: Dashboard Home Page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/page.tsx`

Depends on: Task 1 (StatCard), Task 2 (dashboard.stats router)

- [ ] **Step 1: Replace the redirect with a real dashboard home page**

Replace the entire contents of `apps/web/src/app/(dashboard)/page.tsx` with:

```tsx
// apps/web/src/app/(dashboard)/page.tsx
"use client";

import { trpc } from "@/trpc/client";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, ShieldCheck, AlertTriangle, AlertOctagon, Plus } from "lucide-react";
import Link from "next/link";

export default function DashboardHomePage() {
  const statsQuery = trpc.dashboard.stats.useQuery();
  const sitesQuery = trpc.sites.list.useQuery();

  const stats = statsQuery.data;
  const activeSites = sitesQuery.data?.filter((s) => s.status !== "archived") ?? [];

  // Sites needing attention: lowest compliance scores or never scanned
  const sitesNeedingAttention = [...activeSites]
    .sort((a, b) => {
      // Never scanned first, then lowest score
      if (a.complianceScore === null && b.complianceScore === null) return 0;
      if (a.complianceScore === null) return -1;
      if (b.complianceScore === null) return -1;
      return a.complianceScore - b.complianceScore;
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your accessibility compliance status.
          </p>
        </div>
        <Button asChild>
          <Link href="/sites">
            <Plus className="mr-1 h-4 w-4" />
            Add Site
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      {statsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="h-12 w-12 animate-pulse rounded-lg bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-12 animate-pulse rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Sites"
            value={stats.totalSites}
            icon={Globe}
          />
          <StatCard
            label="Avg. Compliance"
            value={stats.avgComplianceScore !== null ? `${stats.avgComplianceScore}%` : "—"}
            icon={ShieldCheck}
          />
          <StatCard
            label="Open Violations"
            value={stats.totalOpenViolations}
            icon={AlertTriangle}
          />
          <StatCard
            label="Critical Issues"
            value={stats.criticalViolations}
            icon={AlertOctagon}
          />
        </div>
      ) : null}

      {/* Sites Needing Attention */}
      <Card>
        <CardHeader>
          <CardTitle>Sites Needing Attention</CardTitle>
          <CardDescription>
            Sites with the lowest compliance scores or pending first scan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sitesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : sitesNeedingAttention.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sites yet.{" "}
              <Link href="/sites" className="text-primary underline">
                Add your first site
              </Link>{" "}
              to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {sitesNeedingAttention.map((site) => (
                <Link
                  key={site.id}
                  href={`/sites/${site.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{site.name}</p>
                    <p className="text-sm text-muted-foreground">{site.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {site.complianceScore !== null ? (
                      <Badge
                        variant={site.complianceScore >= 80 ? "default" : site.complianceScore >= 50 ? "secondary" : "destructive"}
                      >
                        {site.complianceScore}%
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not scanned</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/page.tsx
git commit -m "feat(web): replace dashboard redirect with real home page with stats and attention list"
```

---

## Task 5: Enhanced Sites Page

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sites/page.tsx`

Depends on: Task 3 (ScanButton)

- [ ] **Step 1: Enhance the sites page with scan button, last scan info, and navigation**

Replace the entire contents of `apps/web/src/app/(dashboard)/sites/page.tsx` with:

```tsx
// apps/web/src/app/(dashboard)/sites/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Globe, Trash2, ExternalLink, Clock } from "lucide-react";
import { toast } from "sonner";
import { ScanButton } from "@/components/dashboard/scan-button";

function formatTimeAgo(date: Date | string | null): string {
  if (!date) return "Never";
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function SitesPage() {
  const utils = trpc.useUtils();
  const sitesQuery = trpc.sites.list.useQuery();
  const addSite = trpc.sites.add.useMutation({
    onSuccess: () => {
      utils.sites.list.invalidate();
      setDialogOpen(false);
      setNewUrl("");
      setNewName("");
      toast.success("Site added!");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteSite = trpc.sites.delete.useMutation({
    onSuccess: () => {
      utils.sites.list.invalidate();
      toast.success("Site archived");
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");

  const activeSites =
    sitesQuery.data?.filter((s) => s.status !== "archived") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sites</h2>
          <p className="text-muted-foreground">
            Manage websites monitored for accessibility compliance.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              Add Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a new site</DialogTitle>
              <DialogDescription>
                Enter the URL and name for the website you want to monitor.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addSite.mutate({ url: newUrl, name: newName || new URL(newUrl).hostname });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="My Website"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addSite.isPending}>
                  {addSite.isPending ? "Adding..." : "Add Site"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sitesQuery.isLoading ? (
        <p className="text-muted-foreground">Loading sites...</p>
      ) : activeSites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No sites yet</p>
            <p className="text-sm text-muted-foreground">
              Add your first website to start monitoring.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeSites.map((site) => (
            <Card key={site.id} className="transition-colors hover:bg-muted/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Link href={`/sites/${site.id}`} className="flex-1 min-w-0">
                  <CardTitle className="text-base">{site.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    {site.url}
                    <ExternalLink className="h-3 w-3" />
                  </CardDescription>
                </Link>
                <div className="flex items-center gap-2">
                  {site.lastScanAt && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(site.lastScanAt)}
                    </span>
                  )}
                  {site.complianceScore !== null ? (
                    <Badge
                      variant={
                        site.complianceScore >= 80
                          ? "default"
                          : site.complianceScore >= 50
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {site.complianceScore}%
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not scanned</Badge>
                  )}
                  <ScanButton
                    siteId={site.id}
                    onScanComplete={() => utils.sites.list.invalidate()}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteSite.mutate({ id: site.id });
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/sites/page.tsx
git commit -m "feat(web): enhance sites page with scan button, last scan time, and click-to-navigate"
```

---

## Task 6: SiteHeader Component

**Files:**
- Create: `apps/web/src/components/dashboard/site-header.tsx`

Depends on: Task 3 (ScanButton)

- [ ] **Step 1: Create the SiteHeader component**

```tsx
// apps/web/src/components/dashboard/site-header.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { ScanButton } from "@/components/dashboard/scan-button";
import { ExternalLink } from "lucide-react";

interface SiteHeaderProps {
  siteId: string;
  name: string;
  url: string;
  complianceScore: number | null;
  onScanComplete?: () => void;
}

export function SiteHeader({
  siteId,
  name,
  url,
  complianceScore,
  onScanComplete,
}: SiteHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-2xl font-bold">{name}</h2>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {url}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-3">
        {complianceScore !== null ? (
          <Badge
            variant={
              complianceScore >= 80
                ? "default"
                : complianceScore >= 50
                  ? "secondary"
                  : "destructive"
            }
            className="text-lg px-3 py-1"
          >
            {complianceScore}%
          </Badge>
        ) : (
          <Badge variant="outline" className="text-lg px-3 py-1">
            Not scanned
          </Badge>
        )}
        <ScanButton siteId={siteId} onScanComplete={onScanComplete} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/site-header.tsx
git commit -m "feat(web): add SiteHeader component with score badge and scan button"
```

---

## Task 7: ScanHistoryTable Component

**Files:**
- Create: `apps/web/src/components/dashboard/scan-history.tsx`

- [ ] **Step 1: Create the ScanHistoryTable component**

```tsx
// apps/web/src/components/dashboard/scan-history.tsx
"use client";

import { Badge } from "@/components/ui/badge";

interface Scan {
  id: string;
  status: string;
  pagesScanned: number | null;
  complianceScore: number | null;
  durationMs: number | null;
  createdAt: Date | string;
}

interface ScanHistoryTableProps {
  scans: Scan[];
  onSelectScan?: (scanId: string) => void;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  processing: "secondary",
  queued: "outline",
  failed: "destructive",
};

export function ScanHistoryTable({ scans, onSelectScan }: ScanHistoryTableProps) {
  if (scans.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No scans yet. Run your first scan to see results here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Pages</th>
            <th className="pb-2 font-medium">Score</th>
            <th className="pb-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => (
            <tr
              key={scan.id}
              className={onSelectScan ? "cursor-pointer hover:bg-muted/50" : ""}
              onClick={() => onSelectScan?.(scan.id)}
            >
              <td className="py-2">{formatDate(scan.createdAt)}</td>
              <td className="py-2">
                <Badge variant={statusVariant[scan.status] ?? "outline"}>
                  {scan.status}
                </Badge>
              </td>
              <td className="py-2">{scan.pagesScanned ?? "—"}</td>
              <td className="py-2">
                {scan.complianceScore !== null ? `${scan.complianceScore}%` : "—"}
              </td>
              <td className="py-2">{formatDuration(scan.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/scan-history.tsx
git commit -m "feat(web): add ScanHistoryTable component with status badges and duration"
```

---

## Task 8: ViolationSheet Component

**Files:**
- Create: `apps/web/src/components/dashboard/violation-sheet.tsx`

- [ ] **Step 1: Create the ViolationSheet slide-over panel**

```tsx
// apps/web/src/components/dashboard/violation-sheet.tsx
"use client";

import { trpc } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Check, EyeOff, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Violation {
  id: string;
  ruleId: string;
  impact: string;
  description: string;
  helpUrl: string | null;
  htmlSnippet: string | null;
  selector: string | null;
  aiExplanation: string | null;
  aiFixCode: string | null;
  status: string;
  scanPageId: string;
}

interface ViolationSheetProps {
  violation: Violation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusUpdated?: () => void;
}

const impactVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  serious: "default",
  moderate: "secondary",
  minor: "outline",
};

export function ViolationSheet({
  violation,
  open,
  onOpenChange,
  onStatusUpdated,
}: ViolationSheetProps) {
  const utils = trpc.useUtils();
  const updateStatus = trpc.violations.updateStatus.useMutation({
    onSuccess: () => {
      utils.violations.listByScan.invalidate();
      onStatusUpdated?.();
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!violation) return null;

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant={impactVariant[violation.impact] ?? "outline"}>
              {violation.impact}
            </Badge>
            <SheetTitle className="text-base">{violation.ruleId}</SheetTitle>
          </div>
          <SheetDescription>{violation.description}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Location */}
          {violation.selector && (
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                CSS Selector
              </h4>
              <code className="block rounded bg-muted px-3 py-2 text-xs">
                {violation.selector}
              </code>
            </div>
          )}

          {/* HTML Snippet */}
          {violation.htmlSnippet && (
            <div>
              <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                HTML Snippet
              </h4>
              <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                {violation.htmlSnippet}
              </pre>
            </div>
          )}

          {/* Help URL */}
          {violation.helpUrl && (
            <a
              href={violation.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Learn more about this rule
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <Separator />

          {/* AI Explanation */}
          {violation.aiExplanation && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">AI Explanation</h4>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed">
                {violation.aiExplanation}
              </div>
            </div>
          )}

          {/* AI Fix Code */}
          {violation.aiFixCode && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Suggested Fix</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(violation.aiFixCode!)}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs">
                <code>{violation.aiFixCode}</code>
              </pre>
            </div>
          )}

          {!violation.aiExplanation && !violation.aiFixCode && (
            <p className="text-sm text-muted-foreground italic">
              AI suggestions are being generated. Check back shortly.
            </p>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant={violation.status === "fixed" ? "secondary" : "default"}
              size="sm"
              onClick={() =>
                updateStatus.mutate({
                  violationId: violation.id,
                  status: violation.status === "fixed" ? "open" : "fixed",
                })
              }
              disabled={updateStatus.isPending}
            >
              <Check className="mr-1 h-4 w-4" />
              {violation.status === "fixed" ? "Reopen" : "Mark Fixed"}
            </Button>
            <Button
              variant={violation.status === "ignored" ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                updateStatus.mutate({
                  violationId: violation.id,
                  status: violation.status === "ignored" ? "open" : "ignored",
                })
              }
              disabled={updateStatus.isPending}
            >
              <EyeOff className="mr-1 h-4 w-4" />
              {violation.status === "ignored" ? "Unignore" : "Ignore"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/violation-sheet.tsx
git commit -m "feat(web): add ViolationSheet slide-over with AI explanation and fix code"
```

---

## Task 9: ViolationList Component

**Files:**
- Create: `apps/web/src/components/dashboard/violation-list.tsx`

Depends on: Task 8 (ViolationSheet)

- [ ] **Step 1: Create the ViolationList component with filters**

```tsx
// apps/web/src/components/dashboard/violation-list.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViolationSheet } from "@/components/dashboard/violation-sheet";

interface ViolationListProps {
  scanId: string;
}

const impactOptions = ["critical", "serious", "moderate", "minor"] as const;
const statusOptions = ["open", "fixed", "ignored"] as const;

const impactVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  serious: "default",
  moderate: "secondary",
  minor: "outline",
};

export function ViolationList({ scanId }: ViolationListProps) {
  const [impactFilter, setImpactFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>("open");
  const [selectedViolation, setSelectedViolation] = useState<null | {
    id: string;
    ruleId: string;
    impact: string;
    description: string;
    helpUrl: string | null;
    htmlSnippet: string | null;
    selector: string | null;
    aiExplanation: string | null;
    aiFixCode: string | null;
    status: string;
    scanPageId: string;
  }>(null);

  const violationsQuery = trpc.violations.listByScan.useQuery({
    scanId,
    impact: impactFilter as "critical" | "serious" | "moderate" | "minor" | undefined,
    status: statusFilter as "open" | "fixed" | "ignored" | undefined,
  });

  const violations = violationsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Impact:</span>
          <Button
            variant={impactFilter === undefined ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setImpactFilter(undefined)}
          >
            All
          </Button>
          {impactOptions.map((impact) => (
            <Button
              key={impact}
              variant={impactFilter === impact ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                setImpactFilter(impactFilter === impact ? undefined : impact)
              }
            >
              {impact}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          <Button
            variant={statusFilter === undefined ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter(undefined)}
          >
            All
          </Button>
          {statusOptions.map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                setStatusFilter(statusFilter === status ? undefined : status)
              }
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {violationsQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading violations...
        </p>
      ) : violations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No violations found with current filters.
        </p>
      ) : (
        <div className="space-y-2">
          {violations.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedViolation(v)}
              className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={impactVariant[v.impact] ?? "outline"} className="shrink-0">
                    {v.impact}
                  </Badge>
                  <span className="font-medium text-sm truncate">{v.ruleId}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {v.description}
                </p>
              </div>
              <div className="ml-2 shrink-0">
                <Badge
                  variant={v.status === "open" ? "outline" : v.status === "fixed" ? "default" : "secondary"}
                >
                  {v.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sheet */}
      <ViolationSheet
        violation={selectedViolation}
        open={selectedViolation !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedViolation(null);
        }}
        onStatusUpdated={() => violationsQuery.refetch()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/violation-list.tsx
git commit -m "feat(web): add ViolationList component with impact/status filters and sheet integration"
```

---

## Task 10: Site Detail Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx`

Depends on: Tasks 1 (StatCard), 3 (ScanButton), 6 (SiteHeader), 7 (ScanHistoryTable), 9 (ViolationList)

- [ ] **Step 1: Create the site detail directory**

Run: `mkdir -p apps/web/src/app/\(dashboard\)/sites/\[siteId\]`

- [ ] **Step 2: Create the tabbed site detail page**

```tsx
// apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx
"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { SiteHeader } from "@/components/dashboard/site-header";
import { ScanHistoryTable } from "@/components/dashboard/scan-history";
import { ViolationList } from "@/components/dashboard/violation-list";
import {
  ShieldCheck,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";

export default function SiteDetailPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const siteId = params.siteId;

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);

  const sitesQuery = trpc.sites.list.useQuery();
  const scansQuery = trpc.scans.listBySite.useQuery({ siteId, limit: 100 });

  const site = sitesQuery.data?.find((s) => s.id === siteId);
  const allScans = scansQuery.data ?? [];
  const latestCompletedScan = allScans.find((s) => s.status === "completed");
  const recentScans = allScans.slice(0, 5);

  // Use latest completed scan for violations tab, or selected scan
  const violationsScanId = selectedScanId ?? latestCompletedScan?.id ?? null;

  const violationCounts = latestCompletedScan?.violationCounts as {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  } | null;

  function handleScanComplete() {
    sitesQuery.refetch();
    scansQuery.refetch();
  }

  function handleSelectScan(scanId: string) {
    setSelectedScanId(scanId);
    setActiveTab("violations");
  }

  if (sitesQuery.isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (!site) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push("/sites")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Sites
        </Button>
        <p className="text-muted-foreground">Site not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/sites")}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Sites
      </Button>

      <SiteHeader
        siteId={siteId}
        name={site.name}
        url={site.url}
        complianceScore={site.complianceScore}
        onScanComplete={handleScanComplete}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scans">Scans</TabsTrigger>
          <TabsTrigger value="violations">Violations</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Violation breakdown stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Compliance Score"
              value={
                site.complianceScore !== null
                  ? `${site.complianceScore}%`
                  : "—"
              }
              icon={ShieldCheck}
            />
            <StatCard
              label="Critical"
              value={violationCounts?.critical ?? 0}
              icon={AlertOctagon}
            />
            <StatCard
              label="Serious"
              value={violationCounts?.serious ?? 0}
              icon={AlertTriangle}
            />
            <StatCard
              label="Moderate + Minor"
              value={
                (violationCounts?.moderate ?? 0) +
                (violationCounts?.minor ?? 0)
              }
              icon={AlertCircle}
            />
          </div>

          {/* Recent Scans */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Scans</CardTitle>
            </CardHeader>
            <CardContent>
              {scansQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <ScanHistoryTable
                  scans={recentScans}
                  onSelectScan={handleSelectScan}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scans Tab */}
        <TabsContent value="scans">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scan History</CardTitle>
            </CardHeader>
            <CardContent>
              {scansQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <ScanHistoryTable
                  scans={allScans}
                  onSelectScan={handleSelectScan}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Violations Tab */}
        <TabsContent value="violations">
          {violationsScanId ? (
            <ViolationList scanId={violationsScanId} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No completed scans yet. Run a scan to see violations.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/sites/\[siteId\]/page.tsx
git commit -m "feat(web): add site detail page with tabbed layout (overview, scans, violations)"
```

---

## Task 11: Update Topbar for Site Detail Breadcrumbs

**Files:**
- Modify: `apps/web/src/components/dashboard/topbar.tsx`

- [ ] **Step 1: Update topbar to handle dynamic /sites/[siteId] routes**

Replace the entire contents of `apps/web/src/components/dashboard/topbar.tsx` with:

```tsx
// apps/web/src/components/dashboard/topbar.tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/sites": "Sites",
  "/team": "Team",
  "/settings": "Settings",
  "/onboarding": "Getting Started",
};

export function Topbar() {
  const pathname = usePathname();
  const { data: activeOrg } = useActiveOrganization();

  // Handle dynamic routes: /sites/[siteId] -> "Site Detail"
  const isSiteDetail = /^\/sites\/[^/]+$/.test(pathname);
  const title = isSiteDetail ? "Site Detail" : (pageTitles[pathname] ?? "Dashboard");

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {activeOrg?.name}
        </span>
        <span className="text-muted-foreground">/</span>
        {isSiteDetail && (
          <>
            <Link
              href="/sites"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Sites
            </Link>
            <span className="text-muted-foreground">/</span>
          </>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/sites">
            <Plus className="mr-1 h-4 w-4" />
            Add Site
          </Link>
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/topbar.tsx
git commit -m "feat(web): update topbar breadcrumbs for site detail pages"
```

---

## Task 12: Mark Phase 4 Complete

**Files:**
- Modify: `docs/phases.md`

- [ ] **Step 1: Verify all TypeScript compiles clean**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Clean compilation, no errors.

- [ ] **Step 2: Update phases.md to mark Phase 4 complete**

Find the Phase 4 section in `docs/phases.md` and change its status from whatever it currently shows to `[x] Phase 4: Agency Dashboard (Core)` or similar completion marker, matching the existing format used for Phases 1-3.

- [ ] **Step 3: Commit**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 4 Agency Dashboard as complete"
```

---

## Dependency Graph

```
Task 1 (StatCard) ────────────────┐
Task 2 (dashboard router) ────────┤
                                   ├── Task 4 (Dashboard Home)
Task 3 (ScanButton) ──────┬──────┤
                           │      ├── Task 5 (Enhanced Sites)
                           │      │
                           ├──────┴── Task 6 (SiteHeader)
                           │
Task 7 (ScanHistoryTable) ─┤
                            │
Task 8 (ViolationSheet) ───┤
                            ├── Task 9 (ViolationList)
                            │
                            └── Task 10 (Site Detail Page) ← depends on 1,6,7,9
                                     │
                            Task 11 (Topbar Update) ← independent

Wave 1 (parallel): Tasks 1, 2, 3, 7, 8, 11
Wave 2 (parallel): Tasks 4, 5, 6, 9
Wave 3 (sequential): Task 10
Wave 4 (sequential): Task 12
```
