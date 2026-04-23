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
