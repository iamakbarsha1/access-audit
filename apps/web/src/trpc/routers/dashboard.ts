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
