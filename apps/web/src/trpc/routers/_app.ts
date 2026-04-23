import { createTRPCRouter } from "../init";
import { authRouter } from "./auth";
import { organizationRouter } from "./organization";
import { membersRouter } from "./members";
import { sitesRouter } from "./sites";
import { scansRouter } from "./scans";
import { violationsRouter } from "./violations";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  members: membersRouter,
  sites: sitesRouter,
  scans: scansRouter,
  violations: violationsRouter,
});

export type AppRouter = typeof appRouter;
