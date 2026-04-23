import { TRPCError } from "@trpc/server";
import { baseProcedure } from "./init";
import {
  member as memberTable,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, isPaidPlan, isTrialExpired } from "@access-audit/db";

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
} as const;

export type Role = keyof typeof ROLE_HIERARCHY;

export const authedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      session: ctx.session,
      user: ctx.user,
    },
  });
});

export function orgProcedure(minRole: Role = "viewer") {
  return authedProcedure.use(async ({ ctx, next }) => {
    const orgId = ctx.session.session.activeOrganizationId;
    if (!orgId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active organization selected",
      });
    }

    const members = await ctx.db
      .select()
      .from(memberTable)
      .where(
        and(
          eq(memberTable.organizationId, orgId),
          eq(memberTable.userId, ctx.user.id)
        )
      );

    const membership = members[0];
    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Not a member of this organization",
      });
    }

    const userRoleLevel = ROLE_HIERARCHY[membership.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userRoleLevel < requiredLevel) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires ${minRole} role or higher`,
      });
    }

    return next({
      ctx: {
        orgId,
        membership,
      },
    });
  });
}

export function paidProcedure(minRole: Role = "viewer") {
  return orgProcedure(minRole).use(async ({ ctx, next }) => {
    const settings = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.orgId));

    const orgSettings = settings[0];
    const plan = orgSettings?.plan ?? "trial";

    // Paid plans always pass
    if (isPaidPlan(plan)) {
      return next({ ctx: { ...ctx, plan, orgSettings } });
    }

    // Trial plan — check if still valid
    if (!isTrialExpired(orgSettings?.trialEndsAt ?? null)) {
      return next({ ctx: { ...ctx, plan, orgSettings } });
    }

    // Trial expired, no paid plan → block
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your trial has expired. Please upgrade to continue.",
    });
  });
}
