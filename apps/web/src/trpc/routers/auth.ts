import { createTRPCRouter, baseProcedure } from "../init";

export const authRouter = createTRPCRouter({
  getSession: baseProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  getCurrentUser: baseProcedure.query(({ ctx }) => {
    return ctx.user;
  }),
});
