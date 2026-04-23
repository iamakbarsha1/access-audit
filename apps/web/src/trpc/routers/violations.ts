import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { violations, scans, scanPages, sites } from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";

export const violationsRouter = createTRPCRouter({
  listByScan: orgProcedure("viewer")
    .input(
      z.object({
        scanId: z.string().uuid(),
        impact: z
          .enum(["critical", "serious", "moderate", "minor"])
          .optional(),
        status: z.enum(["open", "fixed", "ignored"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify scan's site belongs to this org
      const scan = await ctx.db
        .select({ id: scans.id, siteId: scans.siteId })
        .from(scans)
        .where(eq(scans.id, input.scanId));

      if (!scan[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

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

      // Build filters
      const filters = [eq(violations.scanId, input.scanId)];
      if (input.impact) {
        filters.push(eq(violations.impact, input.impact));
      }
      if (input.status) {
        filters.push(eq(violations.status, input.status));
      }

      const result = await ctx.db
        .select()
        .from(violations)
        .where(and(...filters))
        .orderBy(desc(violations.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return result;
    }),

  listByPage: orgProcedure("viewer")
    .input(z.object({ scanPageId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify page's scan's site belongs to this org
      const page = await ctx.db
        .select({ id: scanPages.id, scanId: scanPages.scanId })
        .from(scanPages)
        .where(eq(scanPages.id, input.scanPageId));

      if (!page[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }

      const scan = await ctx.db
        .select({ id: scans.id, siteId: scans.siteId })
        .from(scans)
        .where(eq(scans.id, page[0].scanId));

      if (!scan[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

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
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }

      const result = await ctx.db
        .select()
        .from(violations)
        .where(eq(violations.scanPageId, input.scanPageId))
        .orderBy(desc(violations.createdAt));

      return result;
    }),

  updateStatus: orgProcedure("member")
    .input(
      z.object({
        violationId: z.string().uuid(),
        status: z.enum(["open", "fixed", "ignored"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify violation's scan's site belongs to this org
      const violation = await ctx.db
        .select({ id: violations.id, scanId: violations.scanId })
        .from(violations)
        .where(eq(violations.id, input.violationId));

      if (!violation[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Violation not found",
        });
      }

      const scan = await ctx.db
        .select({ id: scans.id, siteId: scans.siteId })
        .from(scans)
        .where(eq(scans.id, violation[0].scanId));

      if (!scan[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Violation not found",
        });
      }

      const updated = await ctx.db
        .update(violations)
        .set({ status: input.status })
        .where(eq(violations.id, input.violationId))
        .returning();

      return updated[0];
    }),
});
