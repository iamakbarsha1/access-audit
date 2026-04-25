"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown, FileText } from "lucide-react";
import { BadgeEmbed } from "./badge-embed";
import { ShareLinkTable } from "./share-link-table";
import { canUseWhiteLabel } from "@access-audit/db/plans";

interface DeliverablesTabProps {
  siteId: string;
  scans: Array<{ id: string; status: string; createdAt: Date | string; complianceScore: number | null }>;
}

export function DeliverablesTab({ siteId, scans }: DeliverablesTabProps) {
  const orgQuery = trpc.organization.getOrg.useQuery();
  const plan = orgQuery.data?.settings?.plan ?? "trial";

  const canUseBadge = ["agency", "pro", "trial"].includes(plan);
  const canShareLinks = ["agency", "pro", "trial"].includes(plan);
  const canVpat = plan === "pro";

  const completedScans = scans.filter((s) => s.status === "completed");
  const latestScan = completedScans[0];

  async function handleDownloadPdf(scanId: string) {
    const res = await fetch("/api/reports/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanId }),
    });

    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${scanId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const generateVpat = trpc.reports.generateVpat.useMutation();

  async function handleGenerateVpat() {
    if (!latestScan) return;
    const report = await generateVpat.mutateAsync({
      siteId,
      scanId: latestScan.id,
    });
    window.location.href = `/sites/${siteId}/vpat?reportId=${report.id}`;
  }

  return (
    <div className="space-y-6">
      {/* PDF Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {latestScan ? (
            <div className="space-y-3">
              <Button
                onClick={() => handleDownloadPdf(latestScan.id)}
                variant="outline"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Download Latest Report
              </Button>
              <p className="text-xs text-muted-foreground">
                Generates a PDF from the most recent completed scan. You can also
                download reports for specific scans from the Scans tab.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No completed scans yet. Run a scan to generate reports.
            </p>
          )}
        </CardContent>
      </Card>

      {/* VPAT */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">VPAT Document</CardTitle>
        </CardHeader>
        <CardContent>
          {canVpat ? (
            <div className="space-y-3">
              <Button
                onClick={handleGenerateVpat}
                variant="outline"
                disabled={!latestScan || generateVpat.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                {generateVpat.isPending ? "Generating..." : "Generate VPAT"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Auto-fills WCAG 2.1 AA criteria from scan results. You can review
                and edit before downloading the final PDF.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro to generate VPAT (Voluntary Product Accessibility
              Template) documents.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Badge */}
      <BadgeEmbed siteId={siteId} canAccess={canUseBadge} />

      {/* Share Links */}
      <ShareLinkTable
        siteId={siteId}
        canAccess={canShareLinks}
        scans={completedScans}
        orgSlug={orgQuery.data?.organization?.slug}
        hasWhiteLabel={canUseWhiteLabel(plan)}
      />
    </div>
  );
}
