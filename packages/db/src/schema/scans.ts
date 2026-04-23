import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sites } from "./sites";

export const scans = pgTable("scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("siteId")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  triggeredBy: text("triggeredBy").notNull(),
  status: text("status").notNull().default("queued"),
  pagesFound: integer("pagesFound"),
  pagesScanned: integer("pagesScanned").default(0),
  complianceScore: integer("complianceScore"),
  violationCounts: jsonb("violationCounts").$type<{
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  }>(),
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const scanPages = pgTable("scan_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scanId")
    .notNull()
    .references(() => scans.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: text("status").notNull(),
  complianceScore: integer("complianceScore"),
  violationCounts: jsonb("violationCounts").$type<{
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  }>(),
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const violations = pgTable("violations", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scanId")
    .notNull()
    .references(() => scans.id, { onDelete: "cascade" }),
  scanPageId: uuid("scanPageId")
    .notNull()
    .references(() => scanPages.id, { onDelete: "cascade" }),
  ruleId: text("ruleId").notNull(),
  impact: text("impact").notNull(),
  wcagTags: jsonb("wcagTags").$type<string[]>(),
  description: text("description").notNull(),
  helpUrl: text("helpUrl"),
  htmlSnippet: text("htmlSnippet"),
  selector: text("selector"),
  aiExplanation: text("aiExplanation"),
  aiFixCode: text("aiFixCode"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
