import { createTRPCRouter } from "../init";
import { authRouter } from "./auth";
import { organizationRouter } from "./organization";
import { membersRouter } from "./members";
import { sitesRouter } from "./sites";
import { scansRouter } from "./scans";
import { violationsRouter } from "./violations";
import { dashboardRouter } from "./dashboard";
import { reportsRouter } from "./reports";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  members: membersRouter,
  sites: sitesRouter,
  scans: scansRouter,
  violations: violationsRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
