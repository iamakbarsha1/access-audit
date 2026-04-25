import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("page_views_created_at_idx").on(table.createdAt),
    index("page_views_path_created_at_idx").on(table.path, table.createdAt),
    index("page_views_dedup_idx").on(
      table.visitorHash,
      table.path,
      table.createdAt
    ),
  ]
);

export const pageViewsDaily = pgTable(
  "page_views_daily",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    date: date("date").notNull(),
    views: integer("views").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull(),
    topReferrer: text("top_referrer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("page_views_daily_path_date_idx").on(table.path, table.date),
  ]
);
