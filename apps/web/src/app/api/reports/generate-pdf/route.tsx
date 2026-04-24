import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@access-audit/db/client";
import {
  scans,
  scanPages,
  violations,
  sites,
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import { isBrandedReport } from "@access-audit/db";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import {
  ComplianceReport,
  type ComplianceReportData,
} from "@/lib/pdf/compliance-report";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const scanId = body.scanId as string;

  if (!scanId) {
    return NextResponse.json({ error: "scanId required" }, { status: 400 });
  }

  // Fetch scan
  const scan = await db
    .select()
    .from(scans)
    .where(eq(scans.id, scanId));

  if (!scan[0] || scan[0].status !== "completed") {
    return NextResponse.json({ error: "Scan not found or not completed" }, { status: 404 });
  }

  // Fetch site + verify org access
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, scan[0].siteId));

  if (!site[0]) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const orgId = site[0].organizationId;

  // Fetch org + settings for branding
  const org = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId));

  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, orgId));

  const plan = settings[0]?.plan ?? "trial";
  const branded = isBrandedReport(plan);

  // Fetch pages
  const pages = await db
    .select()
    .from(scanPages)
    .where(eq(scanPages.scanId, scanId));

  // Fetch violations
  const allViolations = await db
    .select({
      ruleId: violations.ruleId,
      impact: violations.impact,
      wcagTags: violations.wcagTags,
      description: violations.description,
      htmlSnippet: violations.htmlSnippet,
      aiExplanation: violations.aiExplanation,
      aiFixCode: violations.aiFixCode,
      scanPageId: violations.scanPageId,
    })
    .from(violations)
    .where(eq(violations.scanId, scanId));

  // Build page URL map
  const pageUrlMap: Record<string, string> = {};
  for (const p of pages) {
    pageUrlMap[p.id] = p.url;
  }

  // Fetch previous scan for comparison
  const previousScans = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.siteId, scan[0].siteId),
        eq(scans.status, "completed")
      )
    )
    .orderBy(desc(scans.createdAt))
    .limit(2);

  const previousScan = previousScans.find((s) => s.id !== scanId) ?? null;

  // Build WCAG criteria mapping
  const criterionViolationCount: Record<string, number> = {};
  for (const v of allViolations) {
    const tags = (v.wcagTags as string[]) ?? [];
    for (const tag of tags) {
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      if (match) {
        const id = `${match[1]}.${match[2]}.${match[3]}`;
        criterionViolationCount[id] = (criterionViolationCount[id] ?? 0) + 1;
      }
    }
  }

  const wcagMapping = WCAG_21_AA_CRITERIA.filter(
    (c) => c.axeCoreRules.length > 0
  ).map((c) => ({
    criterionId: c.id,
    criterionName: c.name,
    level: c.level,
    status: (criterionViolationCount[c.id] ?? 0) > 0 ? "fail" as const : "pass" as const,
    violationCount: criterionViolationCount[c.id] ?? 0,
  }));

  const reportData: ComplianceReportData = {
    logoUrl: branded ? (org[0]?.logo ?? null) : null,
    brandColor: branded ? (settings[0]?.brandColor ?? "#6366f1") : "#6366f1",
    orgName: branded ? (org[0]?.name ?? "AccessAudit") : "AccessAudit",
    siteUrl: site[0].url,
    siteName: site[0].name,
    scanDate: scan[0].completedAt
      ? new Date(scan[0].completedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date(scan[0].createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
    complianceScore: scan[0].complianceScore ?? 0,
    pagesScanned: scan[0].pagesScanned ?? 0,
    durationMs: scan[0].durationMs ?? 0,
    violationCounts: (scan[0].violationCounts as ComplianceReportData["violationCounts"]) ?? {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    },
    previousScan: previousScan
      ? {
          complianceScore: previousScan.complianceScore ?? 0,
          scanDate: new Date(previousScan.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          violationCounts: (previousScan.violationCounts as ComplianceReportData["violationCounts"]) ?? {
            critical: 0,
            serious: 0,
            moderate: 0,
            minor: 0,
          },
        }
      : null,
    pages: pages.map((p) => ({
      url: p.url,
      complianceScore: p.complianceScore,
      violationCounts: p.violationCounts as ComplianceReportData["pages"][0]["violationCounts"],
    })),
    violations: allViolations.map((v) => ({
      ruleId: v.ruleId,
      impact: v.impact,
      wcagTags: (v.wcagTags as string[]) ?? [],
      pageUrl: pageUrlMap[v.scanPageId] ?? "Unknown",
      description: v.description,
      htmlSnippet: v.htmlSnippet,
      aiExplanation: v.aiExplanation,
      aiFixCode: v.aiFixCode,
    })),
    wcagMapping,
  };

  const buffer = await renderToBuffer(
    <ComplianceReport data={reportData} />
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="compliance-report-${site[0].name}-${scan[0].id.slice(0, 8)}.pdf"`,
    },
  });
}
