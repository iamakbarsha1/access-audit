import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { sites, organizationSettings } from "@access-audit/db/schema";
import { eq, and, count } from "@access-audit/db";

export const sitesRouter = createTRPCRouter({
  list: orgProcedure("viewer").query(async ({ ctx }) => {
    const result = await ctx.db
      .select()
      .from(sites)
      .where(eq(sites.organizationId, ctx.orgId))
      .orderBy(sites.createdAt);

    return result;
  }),

  add: orgProcedure("member")
    .input(
      z.object({
        url: z.string().url("Must be a valid URL"),
        name: z.string().min(1, "Name is required").max(100),
        scanFrequency: z
          .enum(["manual", "daily", "weekly", "monthly"])
          .default("daily"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check site quota
      const settings = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const quota = settings[0]?.siteQuota ?? 25;

      const [siteCount] = await ctx.db
        .select({ count: count() })
        .from(sites)
        .where(
          and(
            eq(sites.organizationId, ctx.orgId),
            eq(sites.status, "active")
          )
        );

      if ((siteCount?.count ?? 0) >= quota) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Site limit reached (${quota}). Upgrade your plan for more sites.`,
        });
      }

      // Check for duplicate URL in org
      const existing = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.organizationId, ctx.orgId),
            eq(sites.url, input.url)
          )
        );

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This URL is already added to your organization",
        });
      }

      const inserted = await ctx.db
        .insert(sites)
        .values({
          organizationId: ctx.orgId,
          url: input.url,
          name: input.name,
          scanFrequency: input.scanFrequency,
        })
        .returning();

      return inserted[0];
    }),

  update: orgProcedure("member")
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        scanFrequency: z
          .enum(["manual", "daily", "weekly", "monthly"])
          .optional(),
        status: z.enum(["active", "paused"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const existing = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, id), eq(sites.organizationId, ctx.orgId)));

      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const updated = await ctx.db
        .update(sites)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(sites.id, id))
        .returning();

      return updated[0];
    }),

  delete: orgProcedure("admin")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(sites)
        .where(
          and(eq(sites.id, input.id), eq(sites.organizationId, ctx.orgId))
        );

      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      // Soft delete - archive
      const updated = await ctx.db
        .update(sites)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(sites.id, input.id))
        .returning();

      return updated[0];
    }),
});
