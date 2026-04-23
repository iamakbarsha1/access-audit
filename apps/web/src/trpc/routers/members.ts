import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { member, invitation, user } from "@access-audit/db/schema";
import { eq, and } from "@access-audit/db";
import { auth } from "@/lib/auth";

export const membersRouter = createTRPCRouter({
  list: orgProcedure("viewer").query(async ({ ctx }) => {
    const members = await ctx.db
      .select({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, ctx.orgId));

    const invitations = await ctx.db
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, ctx.orgId),
          eq(invitation.status, "pending")
        )
      );

    return { members, invitations };
  }),

  invite: orgProcedure("admin")
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api.createInvitation({
        headers: new Headers(),
        body: {
          email: input.email,
          role: input.role,
          organizationId: ctx.orgId,
        },
      });
      return result;
    }),

  removeMember: orgProcedure("admin")
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, ctx.orgId)
          )
        );

      if (!target[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      if (target[0].role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove the owner",
        });
      }

      await ctx.db
        .delete(member)
        .where(eq(member.id, input.memberId));

      return { success: true };
    }),

  changeRole: orgProcedure("admin")
    .input(
      z.object({
        memberId: z.string(),
        role: z.enum(["admin", "member", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, ctx.orgId)
          )
        );

      if (!target[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      if (target[0].role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot change the owner's role",
        });
      }

      const updated = await ctx.db
        .update(member)
        .set({ role: input.role })
        .where(eq(member.id, input.memberId))
        .returning();

      return updated[0];
    }),
});
