import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { sites, scans, violations } from "@access-audit/db/schema";
import { eq, and, sql, count, inArray } from "@access-audit/db";

export const dashboardRouter = createTRPCRouter({
  stats: orgProcedure("viewer").query(async ({ ctx }) => {
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

    // Get completed scans with siteId, ordered newest first
    const completedScans = await ctx.db
      .select({ id: scans.id, siteId: scans.siteId })
      .from(scans)
      .where(
        and(
          inArray(scans.siteId, siteIds),
          eq(scans.status, "completed")
        )
      )
      .orderBy(sql`${scans.createdAt} DESC`);

    // Deduplicate: keep only the latest scan per site
    const seenSites = new Set<string>();
    const latestScanIds: string[] = [];
    for (const scan of completedScans) {
      if (!seenSites.has(scan.siteId)) {
        seenSites.add(scan.siteId);
        latestScanIds.push(scan.id);
      }
    }

    if (latestScanIds.length === 0) {
      return {
        totalSites,
        avgComplianceScore,
        totalOpenViolations: 0,
        criticalViolations: 0,
      };
    }

    // Count open violations across latest scans only
    const violationCounts = await ctx.db
      .select({
        total: count(),
        critical: count(
          sql`CASE WHEN ${violations.impact} = 'critical' THEN 1 END`
        ),
      })
      .from(violations)
      .where(
        and(
          inArray(violations.scanId, latestScanIds),
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
