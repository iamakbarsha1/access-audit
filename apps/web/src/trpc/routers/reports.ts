import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import {
  reports,
  vpatEntries,
  violations,
  sites,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import {
  canGenerateVpat,
  canShareLinks,
} from "@access-audit/db";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import { randomBytes } from "crypto";

function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export const reportsRouter = createTRPCRouter({
  listBySite: orgProcedure("viewer")
    .input(
      z.object({
        siteId: z.string().uuid(),
        type: z
          .enum(["pdf", "vpat", "share_snapshot", "share_live"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
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

      const filters = [eq(reports.siteId, input.siteId)];
      if (input.type) {
        filters.push(eq(reports.type, input.type));
      }

      return ctx.db
        .select()
        .from(reports)
        .where(and(...filters))
        .orderBy(desc(reports.createdAt));
    }),

  createShareLink: orgProcedure("member")
    .input(
      z.object({
        siteId: z.string().uuid(),
        type: z.enum(["share_snapshot", "share_live"]),
        scanId: z.string().uuid().optional(),
        expiresIn: z.enum(["7d", "30d", "90d", "never"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const settings = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const plan = settings[0]?.plan ?? "trial";
      if (!canShareLinks(plan)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Upgrade to Agency or Pro to create share links.",
        });
      }

      if (input.type === "share_snapshot" && !input.scanId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "scanId is required for snapshot share links.",
        });
      }

      const expiresAt =
        input.expiresIn === "never"
          ? null
          : new Date(
              Date.now() +
                { "7d": 7, "30d": 30, "90d": 90 }[input.expiresIn] *
                  24 *
                  60 *
                  60 *
                  1000
            );

      const inserted = await ctx.db
        .insert(reports)
        .values({
          siteId: input.siteId,
          scanId: input.type === "share_snapshot" ? input.scanId : null,
          organizationId: ctx.orgId,
          type: input.type,
          shareToken: generateShareToken(),
          expiresAt,
        })
        .returning();

      return inserted[0]!;
    }),

  revokeShareLink: orgProcedure("member")
    .input(z.object({ reportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId)
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      await ctx.db.delete(reports).where(eq(reports.id, input.reportId));

      return { success: true };
    }),

  generateVpat: orgProcedure("member")
    .input(
      z.object({
        siteId: z.string().uuid(),
        scanId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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

      const settings = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const plan = settings[0]?.plan ?? "trial";
      if (!canGenerateVpat(plan)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Upgrade to Pro to generate VPAT documents.",
        });
      }

      const scanViolations = await ctx.db
        .select()
        .from(violations)
        .where(eq(violations.scanId, input.scanId));

      const criterionViolationCount: Record<string, number> = {};
      for (const v of scanViolations) {
        const tags = (v.wcagTags as string[]) ?? [];
        for (const tag of tags) {
          const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
          if (match) {
            const criterionId = `${match[1]}.${match[2]}.${match[3]}`;
            criterionViolationCount[criterionId] =
              (criterionViolationCount[criterionId] ?? 0) + 1;
          }
        }
      }

      const inserted = await ctx.db
        .insert(reports)
        .values({
          siteId: input.siteId,
          scanId: input.scanId,
          organizationId: ctx.orgId,
          type: "vpat",
          metadata: {
            productName: site[0].url,
            reportDate: new Date().toISOString(),
            contactEmail: "",
            productDescription: `Accessibility conformance report for ${site[0].url}`,
            evaluationMethods: "Automated testing with axe-core engine",
          },
        })
        .returning();

      const report = inserted[0]!;

      const entries = WCAG_21_AA_CRITERIA.map((criterion) => {
        const count = criterionViolationCount[criterion.id] ?? 0;
        const hasAxeRules = criterion.axeCoreRules.length > 0;

        let conformanceLevel:
          | "supports"
          | "partially_supports"
          | "does_not_support"
          | "not_applicable"
          | "not_evaluated";
        let autoDetected = false;

        if (!hasAxeRules) {
          conformanceLevel = "not_evaluated";
        } else if (count === 0) {
          conformanceLevel = "supports";
          autoDetected = true;
        } else if (count >= 5) {
          conformanceLevel = "does_not_support";
          autoDetected = true;
        } else {
          conformanceLevel = "partially_supports";
          autoDetected = true;
        }

        return {
          reportId: report.id,
          criterionId: criterion.id,
          level: criterion.level,
          conformanceLevel,
          autoDetected,
          remarks: autoDetected
            ? `Auto-detected: ${count} violation(s) found.`
            : null,
        };
      });

      await ctx.db.insert(vpatEntries).values(entries);

      return report;
    }),

  getVpatEntries: orgProcedure("viewer")
    .input(z.object({ reportId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId)
          )
        );

      if (!report[0] || report[0].type !== "vpat") {
        throw new TRPCError({ code: "NOT_FOUND", message: "VPAT not found" });
      }

      const entries = await ctx.db
        .select()
        .from(vpatEntries)
        .where(eq(vpatEntries.reportId, input.reportId));

      return { report: report[0], entries };
    }),

  updateVpatEntry: orgProcedure("member")
    .input(
      z.object({
        entryId: z.string().uuid(),
        conformanceLevel: z
          .enum([
            "supports",
            "partially_supports",
            "does_not_support",
            "not_applicable",
            "not_evaluated",
          ])
          .optional(),
        remarks: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db
        .select({ id: vpatEntries.id, reportId: vpatEntries.reportId })
        .from(vpatEntries)
        .where(eq(vpatEntries.id, input.entryId));

      if (!entry[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }

      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, entry[0].reportId),
            eq(reports.organizationId, ctx.orgId)
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }

      const updated = await ctx.db
        .update(vpatEntries)
        .set({
          ...(input.conformanceLevel && {
            conformanceLevel: input.conformanceLevel,
          }),
          ...(input.remarks !== undefined && { remarks: input.remarks }),
          autoDetected: false,
          updatedAt: new Date(),
        })
        .where(eq(vpatEntries.id, input.entryId))
        .returning();

      return updated[0];
    }),

  updateVpatMetadata: orgProcedure("member")
    .input(
      z.object({
        reportId: z.string().uuid(),
        metadata: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId),
            eq(reports.type, "vpat")
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "VPAT not found" });
      }

      const updated = await ctx.db
        .update(reports)
        .set({
          metadata: input.metadata,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, input.reportId))
        .returning();

      return updated[0];
    }),

  resetVpat: orgProcedure("member")
    .input(z.object({ reportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId),
            eq(reports.type, "vpat")
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "VPAT not found" });
      }

      await ctx.db
        .delete(vpatEntries)
        .where(eq(vpatEntries.reportId, input.reportId));

      return { success: true };
    }),
});
