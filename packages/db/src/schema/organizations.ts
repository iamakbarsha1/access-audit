import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const organizationSettings = pgTable("organization_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" })
    .unique(),
  brandColor: text("brandColor").notNull().default("#6366f1"),
  plan: text("plan").notNull().default("trial"),
  dodoCustomerId: text("dodoCustomerId"),
  dodoSubscriptionId: text("dodoSubscriptionId"),
  trialEndsAt: timestamp("trialEndsAt").notNull(),
  siteQuota: integer("siteQuota").notNull().default(25),
  scanQuota: integer("scanQuota").notNull().default(50),
  onboardingCompleted: boolean("onboardingCompleted").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
