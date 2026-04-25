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
      if (b.complianceScore === null) return 1;
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
