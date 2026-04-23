import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    scanFrequency: text("scanFrequency").notNull().default("daily"),
    complianceScore: integer("complianceScore"),
    status: text("status").notNull().default("active"),
    lastScanAt: timestamp("lastScanAt"),
    nextScanAt: timestamp("nextScanAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    unique("sites_org_url_unique").on(table.organizationId, table.url),
  ]
);
