import { z } from "zod";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
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
