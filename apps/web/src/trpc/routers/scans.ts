import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { scans, sites } from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import { scanQueue } from "@/lib/scan-queue";

export const scansRouter = createTRPCRouter({
  startScan: orgProcedure("member")
    .input(
      z.object({
        siteId: z.string().uuid(),
        maxPages: z.number().int().min(1).max(500).default(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify site belongs to this org
      const site = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      // Create scan record
      const inserted = await ctx.db
        .insert(scans)
        .values({
          siteId: input.siteId,
          triggeredBy: ctx.membership.userId,
          status: "queued",
        })
        .returning();

      const scan = inserted[0]!;

      // Dispatch job to scanner queue
      await scanQueue.add(
        "scan",
        {
          scanId: scan.id,
          siteId: input.siteId,
          url: site[0].url,
          maxPages: input.maxPages,
        },
        { jobId: scan.id }
      );

      return scan;
    }),

  listBySite: orgProcedure("viewer")
    .input(
      z.object({
        siteId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify site belongs to this org
      const site = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const result = await ctx.db
        .select()
        .from(scans)
        .where(eq(scans.siteId, input.siteId))
        .orderBy(desc(scans.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  getProgress: orgProcedure("viewer")
    .input(z.object({ scanId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch scan with site to verify org ownership
      const scan = await ctx.db
        .select({
          id: scans.id,
          siteId: scans.siteId,
          status: scans.status,
          pagesFound: scans.pagesFound,
          pagesScanned: scans.pagesScanned,
          complianceScore: scans.complianceScore,
          violationCounts: scans.violationCounts,
          errorMessage: scans.errorMessage,
          startedAt: scans.startedAt,
          completedAt: scans.completedAt,
          createdAt: scans.createdAt,
        })
        .from(scans)
        .where(eq(scans.id, input.scanId));

      if (!scan[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

      // Verify scan's site belongs to this org
      const site = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, scan[0].siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

      return scan[0];
    }),
});
