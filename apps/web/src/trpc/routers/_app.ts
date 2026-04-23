import { createTRPCRouter } from "../init";
import { authRouter } from "./auth";
import { organizationRouter } from "./organization";
import { membersRouter } from "./members";
import { sitesRouter } from "./sites";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  members: membersRouter,
  sites: sitesRouter,
});

export type AppRouter = typeof appRouter;
