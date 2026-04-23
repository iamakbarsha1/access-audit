import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { authedProcedure, orgProcedure } from "../middleware";
import {
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq } from "@access-audit/db";

export const organizationRouter = createTRPCRouter({
  getOrg: orgProcedure("viewer").query(async ({ ctx }) => {
    const orgs = await ctx.db
      .select()
      .from(organization)
      .where(eq(organization.id, ctx.orgId));

    const settings = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.orgId));

    return {
      organization: orgs[0] ?? null,
      settings: settings[0] ?? null,
    };
  }),

  updateSettings: orgProcedure("admin")
    .input(
      z.object({
        brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(organizationSettings)
        .set({
          ...(input.brandColor && { brandColor: input.brandColor }),
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, ctx.orgId))
        .returning();

      return updated[0];
    }),

  initSettings: authedProcedure.mutation(async ({ ctx }) => {
    const orgId = ctx.session.session.activeOrganizationId;
    if (!orgId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active organization",
      });
    }

    // Check if settings already exist (idempotent)
    const existing = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, orgId));

    if (existing[0]) return existing[0];

    // Create with trial defaults
    const inserted = await ctx.db
      .insert(organizationSettings)
      .values({
        organizationId: orgId,
        plan: "trial",
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        siteQuota: 25,
        scanQuota: 50,
      })
      .returning();

    return inserted[0];
  }),

  completeOnboarding: orgProcedure("owner").mutation(async ({ ctx }) => {
    const updated = await ctx.db
      .update(organizationSettings)
      .set({
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.organizationId, ctx.orgId))
      .returning();

    return updated[0];
  }),
});
