import {
  pgTable,
  pgEnum,
  text,
  uuid,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sites } from "./sites";
import { scans } from "./scans";
import { organization } from "./auth";

export const reportTypeEnum = pgEnum("report_type", [
  "pdf",
  "vpat",
  "share_snapshot",
  "share_live",
]);

export const conformanceLevelEnum = pgEnum("conformance_level", [
  "supports",
  "partially_supports",
  "does_not_support",
  "not_applicable",
  "not_evaluated",
]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("siteId")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  scanId: uuid("scanId").references(() => scans.id, { onDelete: "set null" }),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  type: reportTypeEnum("type").notNull(),
  storageUrl: text("storageUrl"),
  shareToken: text("shareToken").unique(),
  expiresAt: timestamp("expiresAt"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const vpatEntries = pgTable("vpat_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("reportId")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  criterionId: text("criterionId").notNull(),
  level: text("level").notNull(), // "A" or "AA"
  conformanceLevel: conformanceLevelEnum("conformanceLevel")
    .notNull()
    .default("not_evaluated"),
  remarks: text("remarks"),
  autoDetected: boolean("autoDetected").notNull().default(false),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
