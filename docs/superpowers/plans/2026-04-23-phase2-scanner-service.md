# Phase 2: Scanner Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone scanner service that discovers pages on websites, scans them for WCAG 2.1 AA violations using axe-core, and writes results to PostgreSQL with real-time progress via Redis pub/sub.

**Architecture:** BullMQ worker process on Railway consumes scan jobs from Upstash Redis queue. Uses Puppeteer with 4 concurrent tabs to scan pages. Writes results directly to Neon PostgreSQL via shared `@access-audit/db` package. Publishes progress events via Redis pub/sub. Vercel Cron triggers scheduled scans hourly.

**Tech Stack:** Puppeteer, @axe-core/puppeteer, BullMQ, ioredis, Fastify, p-limit, Drizzle ORM

---

## File Structure

### New files (scanner service — `apps/scanner/`)

| File | Responsibility |
|------|---------------|
| `apps/scanner/package.json` | Package manifest with dependencies |
| `apps/scanner/tsconfig.json` | TypeScript config extending `@access-audit/tsconfig/node.json` |
| `apps/scanner/src/index.ts` | Entry point — starts worker + health server |
| `apps/scanner/src/config.ts` | Environment variables + constants |
| `apps/scanner/src/redis.ts` | Shared ioredis connection (BullMQ + pub/sub) |
| `apps/scanner/src/server.ts` | Fastify health check server |
| `apps/scanner/src/worker.ts` | BullMQ worker — job orchestration |
| `apps/scanner/src/browser.ts` | Puppeteer browser lifecycle management |
| `apps/scanner/src/crawler.ts` | Hybrid page discovery (sitemap + link crawl) |
| `apps/scanner/src/scanner.ts` | axe-core page scanning with concurrent tabs |
| `apps/scanner/src/results.ts` | Database write logic for scan results |
| `apps/scanner/src/progress.ts` | Redis pub/sub progress publisher |
| `apps/scanner/src/types.ts` | Shared TypeScript types for the scanner |

### New files (database schema)

| File | Responsibility |
|------|---------------|
| `packages/db/src/schema/scans.ts` | `scans`, `scanPages`, `violations` table definitions |

### Modified files (database)

| File | Change |
|------|--------|
| `packages/db/src/schema/sites.ts` | Add `lastScanAt`, `nextScanAt` columns |
| `packages/db/src/schema/index.ts` | Export new `scans` schema |

### New files (web app — tRPC + queue + cron)

| File | Responsibility |
|------|---------------|
| `apps/web/src/lib/redis.ts` | Shared ioredis client for web app |
| `apps/web/src/lib/scan-queue.ts` | BullMQ queue instance for enqueuing scan jobs |
| `apps/web/src/trpc/routers/scans.ts` | tRPC router: trigger, list, getById, getProgress |
| `apps/web/src/trpc/routers/violations.ts` | tRPC router: list by scan/page, update status |
| `apps/web/src/app/api/cron/scan/route.ts` | Vercel Cron endpoint for scheduled scans |
| `apps/web/vercel.json` | Cron schedule configuration |

### Modified files (web app)

| File | Change |
|------|--------|
| `apps/web/src/trpc/routers/_app.ts` | Register scans + violations routers |

---

## Task 1: Database Schema — Scans, ScanPages, Violations

**Files:**
- Create: `packages/db/src/schema/scans.ts`
- Modify: `packages/db/src/schema/sites.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Add `lastScanAt` and `nextScanAt` to sites schema**

Edit `packages/db/src/schema/sites.ts` — add two timestamp columns to the `sites` table definition:

```typescript
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
```

- [ ] **Step 2: Create scans schema file**

Create `packages/db/src/schema/scans.ts`:

```typescript
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
  triggeredBy: text("triggeredBy").notNull(), // "manual" | "scheduled" | "bulk"
  status: text("status").notNull().default("queued"), // queued | crawling | scanning | completed | failed
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
  status: text("status").notNull(), // "scanned" | "failed" | "skipped"
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
  impact: text("impact").notNull(), // "critical" | "serious" | "moderate" | "minor"
  wcagTags: jsonb("wcagTags").$type<string[]>(),
  description: text("description").notNull(),
  helpUrl: text("helpUrl"),
  htmlSnippet: text("htmlSnippet"),
  selector: text("selector"),
  aiExplanation: text("aiExplanation"),
  aiFixCode: text("aiFixCode"),
  status: text("status").notNull().default("open"), // "open" | "fixed" | "ignored"
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

- [ ] **Step 3: Export scans schema from index**

Edit `packages/db/src/schema/index.ts`:

```typescript
export * from "./auth";
export * from "./organizations";
export * from "./sites";
export * from "./scans";
```

- [ ] **Step 4: Push schema to database**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm db:push`

Expected: Schema push succeeds, `scans`, `scan_pages`, `violations` tables created, `sites` table updated with new columns.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/scans.ts packages/db/src/schema/sites.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add scans, scan_pages, violations schemas and update sites table"
```

---

## Task 2: Scanner Service Scaffolding

**Files:**
- Create: `apps/scanner/package.json`
- Create: `apps/scanner/tsconfig.json`
- Create: `apps/scanner/src/config.ts`
- Create: `apps/scanner/src/types.ts`

- [ ] **Step 1: Create scanner package.json**

Create `apps/scanner/package.json`:

```json
{
  "name": "@access-audit/scanner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc"
  },
  "dependencies": {
    "@access-audit/db": "workspace:*",
    "@axe-core/puppeteer": "^4",
    "bullmq": "^5",
    "dotenv": "^16",
    "fastify": "^5",
    "ioredis": "^5",
    "p-limit": "^6",
    "puppeteer": "^24"
  },
  "devDependencies": {
    "@access-audit/tsconfig": "workspace:*",
    "@types/node": "^22",
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create scanner tsconfig.json**

Create `apps/scanner/tsconfig.json`:

```json
{
  "extends": "@access-audit/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create config.ts**

Create `apps/scanner/src/config.ts`:

```typescript
import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.UPSTASH_REDIS_URL!,
  port: parseInt(process.env.PORT || "3001", 10),
  maxConcurrentTabs: parseInt(process.env.MAX_CONCURRENT_TABS || "4", 10),
  pageTimeoutMs: parseInt(process.env.PAGE_TIMEOUT_MS || "30000", 10),
  jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_MS || "600000", 10),
  pageRetries: 2,
  pageRetryDelayMs: 1000,
} as const;
```

- [ ] **Step 4: Create types.ts**

Create `apps/scanner/src/types.ts`:

```typescript
export interface ScanJob {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}

export interface PageResult {
  url: string;
  status: "scanned" | "failed" | "skipped";
  complianceScore: number | null;
  violationCounts: ViolationCounts | null;
  violations: ViolationResult[];
  errorMessage: string | null;
  durationMs: number;
}

export interface ViolationResult {
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  wcagTags: string[];
  description: string;
  helpUrl: string;
  htmlSnippet: string;
  selector: string;
}

export interface ViolationCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export type ProgressEvent =
  | { event: "crawl_start"; scanId: string }
  | { event: "crawl_complete"; scanId: string; totalPages: number }
  | {
      event: "page_scanned";
      scanId: string;
      pagesScanned: number;
      totalPages: number;
      currentUrl: string;
    }
  | { event: "scan_complete"; scanId: string; complianceScore: number }
  | { event: "scan_failed"; scanId: string; error: string };
```

- [ ] **Step 5: Install dependencies**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm install`

Expected: All dependencies installed, no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/scanner/package.json apps/scanner/tsconfig.json apps/scanner/src/config.ts apps/scanner/src/types.ts pnpm-lock.yaml
git commit -m "feat(scanner): scaffold scanner service with package, config, and types"
```

---

## Task 3: Redis Client + Progress Publisher

**Files:**
- Create: `apps/scanner/src/redis.ts`
- Create: `apps/scanner/src/progress.ts`

- [ ] **Step 1: Create Redis client**

Create `apps/scanner/src/redis.ts`:

```typescript
import Redis from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
});

// Separate connection for pub/sub (pub/sub connections can't be used for commands)
export const redisPub = new Redis(config.redisUrl);
```

- [ ] **Step 2: Create progress publisher**

Create `apps/scanner/src/progress.ts`:

```typescript
import { redisPub } from "./redis.js";
import type { ProgressEvent } from "./types.js";

export async function publishProgress(
  scanId: string,
  event: ProgressEvent
): Promise<void> {
  const channel = `scan:${scanId}:progress`;
  await redisPub.publish(channel, JSON.stringify(event));
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/src/redis.ts apps/scanner/src/progress.ts
git commit -m "feat(scanner): add Redis client and progress publisher"
```

---

## Task 4: Browser Lifecycle Manager

**Files:**
- Create: `apps/scanner/src/browser.ts`

- [ ] **Step 1: Create browser manager**

Create `apps/scanner/src/browser.ts`:

```typescript
import puppeteer, { type Browser } from "puppeteer";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    return browser;
  }

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--single-process",
    ],
  });

  browser.on("disconnected", () => {
    browser = null;
  });

  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scanner/src/browser.ts
git commit -m "feat(scanner): add Puppeteer browser lifecycle manager"
```

---

## Task 5: Hybrid Crawler (Sitemap + Link Crawl)

**Files:**
- Create: `apps/scanner/src/crawler.ts`

- [ ] **Step 1: Create crawler module**

Create `apps/scanner/src/crawler.ts`:

```typescript
import type { Browser } from "puppeteer";

/**
 * Hybrid page discovery: sitemap-first + link crawl supplement.
 * Returns a deduplicated list of URLs to scan, capped at maxPages.
 */
export async function discoverPages(
  browser: Browser,
  rootUrl: string,
  maxPages: number
): Promise<string[]> {
  const baseUrl = new URL(rootUrl);
  const discovered = new Set<string>();

  // Phase 1: Try sitemap
  const sitemapUrls = await fetchSitemapUrls(baseUrl.origin);
  for (const url of sitemapUrls) {
    if (discovered.size >= maxPages) break;
    const normalized = normalizeUrl(url, baseUrl.origin);
    if (normalized && isSameDomain(normalized, baseUrl.origin)) {
      discovered.add(normalized);
    }
  }

  // Phase 2: Link crawl from homepage to supplement
  if (discovered.size < maxPages) {
    const crawledUrls = await crawlLinks(browser, baseUrl.origin, maxPages);
    for (const url of crawledUrls) {
      if (discovered.size >= maxPages) break;
      discovered.add(url);
    }
  }

  return Array.from(discovered).slice(0, maxPages);
}

async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const urls: string[] = [];

  try {
    const response = await fetch(`${origin}/sitemap.xml`);
    if (!response.ok) return urls;

    const xml = await response.text();

    // Check if it's a sitemap index
    const sitemapIndexMatches = xml.match(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi);
    if (sitemapIndexMatches) {
      // It's a sitemap index — fetch the first child sitemap
      const locMatch = sitemapIndexMatches[0]?.match(/<loc>(.*?)<\/loc>/i);
      if (locMatch?.[1]) {
        const childResponse = await fetch(locMatch[1]);
        if (childResponse.ok) {
          const childXml = await childResponse.text();
          extractLocsFromXml(childXml, urls);
        }
      }
    } else {
      extractLocsFromXml(xml, urls);
    }
  } catch {
    // Sitemap fetch failed — not an error, fall through to link crawl
  }

  return urls;
}

function extractLocsFromXml(xml: string, urls: string[]): void {
  const locRegex = /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    if (match[1]) {
      urls.push(match[1].trim());
    }
  }
}

async function crawlLinks(
  browser: Browser,
  origin: string,
  maxPages: number
): Promise<string[]> {
  const discovered = new Set<string>();
  const page = await browser.newPage();

  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15000 });

    const hrefs = await page.$$eval("a[href]", (anchors) =>
      anchors.map((a) => a.getAttribute("href")).filter(Boolean)
    );

    for (const href of hrefs) {
      if (discovered.size >= maxPages) break;
      const normalized = normalizeUrl(href!, origin);
      if (normalized && isSameDomain(normalized, origin)) {
        discovered.add(normalized);
      }
    }
  } catch {
    // Link crawl failed — return what we have
  } finally {
    await page.close();
  }

  return Array.from(discovered);
}

function normalizeUrl(url: string, origin: string): string | null {
  try {
    const resolved = new URL(url, origin);
    // Strip fragment and trailing slash
    resolved.hash = "";
    let normalized = resolved.href;
    if (normalized.endsWith("/") && normalized !== resolved.origin + "/") {
      normalized = normalized.slice(0, -1);
    }

    // Filter out non-HTML resources
    const ext = resolved.pathname.split(".").pop()?.toLowerCase();
    const nonHtmlExts = ["pdf", "jpg", "jpeg", "png", "gif", "svg", "webp", "css", "js", "zip", "xml", "json"];
    if (ext && nonHtmlExts.includes(ext)) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function isSameDomain(url: string, origin: string): boolean {
  try {
    const urlHost = new URL(url).hostname;
    const originHost = new URL(origin).hostname;
    return urlHost === originHost;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scanner/src/crawler.ts
git commit -m "feat(scanner): add hybrid page crawler with sitemap + link discovery"
```

---

## Task 6: Page Scanner (axe-core + Concurrent Tabs)

**Files:**
- Create: `apps/scanner/src/scanner.ts`

- [ ] **Step 1: Create page scanner**

Create `apps/scanner/src/scanner.ts`:

```typescript
import { AxePuppeteer } from "@axe-core/puppeteer";
import type { Browser } from "puppeteer";
import pLimit from "p-limit";
import { config } from "./config.js";
import type { PageResult, ViolationResult, ViolationCounts } from "./types.js";

/**
 * Scan multiple pages for WCAG 2.1 AA violations using concurrent browser tabs.
 * Calls onPageComplete after each page finishes for progress reporting.
 */
export async function scanPages(
  browser: Browser,
  urls: string[],
  onPageComplete: (result: PageResult, index: number) => void
): Promise<PageResult[]> {
  const limit = pLimit(config.maxConcurrentTabs);
  const results = await Promise.allSettled(
    urls.map((url, index) =>
      limit(async () => {
        const result = await scanPageWithRetry(browser, url);
        onPageComplete(result, index);
        return result;
      })
    )
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          url: urls[i]!,
          status: "failed" as const,
          complianceScore: null,
          violationCounts: null,
          violations: [],
          errorMessage: r.reason?.message || "Unknown error",
          durationMs: 0,
        }
  );
}

async function scanPageWithRetry(
  browser: Browser,
  url: string
): Promise<PageResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.pageRetries; attempt++) {
    try {
      return await scanSinglePage(browser, url);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.pageRetries) {
        const delay = config.pageRetryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    url,
    status: "failed",
    complianceScore: null,
    violationCounts: null,
    violations: [],
    errorMessage: lastError?.message || "All retries exhausted",
    durationMs: 0,
  };
}

async function scanSinglePage(
  browser: Browser,
  url: string
): Promise<PageResult> {
  const start = Date.now();
  const page = await browser.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: config.pageTimeoutMs,
    });

    const results = await new AxePuppeteer(page)
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const violations: ViolationResult[] = [];
    const counts: ViolationCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };

    for (const violation of results.violations) {
      const impact = (violation.impact || "minor") as keyof ViolationCounts;
      for (const node of violation.nodes) {
        counts[impact] = (counts[impact] || 0) + 1;
        violations.push({
          ruleId: violation.id,
          impact,
          wcagTags: violation.tags,
          description: violation.description,
          helpUrl: violation.helpUrl,
          htmlSnippet: node.html,
          selector: node.target.join(", "),
        });
      }
    }

    const totalChecks = results.passes.length + results.violations.length;
    const complianceScore =
      totalChecks > 0
        ? Math.round((results.passes.length / totalChecks) * 100)
        : 100;

    return {
      url,
      status: "scanned",
      complianceScore,
      violationCounts: counts,
      violations,
      errorMessage: null,
      durationMs: Date.now() - start,
    };
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scanner/src/scanner.ts
git commit -m "feat(scanner): add axe-core page scanner with concurrent tabs and retry"
```

---

## Task 7: Results Writer

**Files:**
- Create: `apps/scanner/src/results.ts`

- [ ] **Step 1: Create results writer**

Create `apps/scanner/src/results.ts`:

```typescript
import { db, eq } from "@access-audit/db";
import {
  scans,
  scanPages,
  violations as violationsTable,
  sites,
} from "@access-audit/db/schema";
import type { PageResult, ViolationCounts } from "./types.js";

/**
 * Write a single page result (scan_page + violations) to the database.
 */
export async function writePageResult(
  scanId: string,
  result: PageResult
): Promise<void> {
  const [insertedPage] = await db
    .insert(scanPages)
    .values({
      scanId,
      url: result.url,
      status: result.status,
      complianceScore: result.complianceScore,
      violationCounts: result.violationCounts,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    })
    .returning({ id: scanPages.id });

  if (result.violations.length > 0 && insertedPage) {
    await db.insert(violationsTable).values(
      result.violations.map((v) => ({
        scanId,
        scanPageId: insertedPage.id,
        ruleId: v.ruleId,
        impact: v.impact,
        wcagTags: v.wcagTags,
        description: v.description,
        helpUrl: v.helpUrl,
        htmlSnippet: v.htmlSnippet,
        selector: v.selector,
      }))
    );
  }

  // Increment pagesScanned on the scan record
  await db.execute(
    db
      .update(scans)
      .set({ pagesScanned: db.$count(scanPages, eq(scanPages.scanId, scanId)) })
      .where(eq(scans.id, scanId))
      .getSQL()
  );
}

/**
 * Finalize a scan: calculate overall compliance score and update scan + site records.
 */
export async function finalizeScan(
  scanId: string,
  siteId: string,
  pageResults: PageResult[],
  durationMs: number
): Promise<number> {
  // Aggregate violation counts
  const totalCounts: ViolationCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalViolations = 0;
  let scannedPages = 0;
  let totalComplianceSum = 0;

  for (const result of pageResults) {
    if (result.status === "scanned") {
      scannedPages++;
      totalComplianceSum += result.complianceScore ?? 0;
      if (result.violationCounts) {
        totalCounts.critical += result.violationCounts.critical;
        totalCounts.serious += result.violationCounts.serious;
        totalCounts.moderate += result.violationCounts.moderate;
        totalCounts.minor += result.violationCounts.minor;
      }
      totalViolations += result.violations.length;
    }
  }

  const complianceScore =
    scannedPages > 0 ? Math.round(totalComplianceSum / scannedPages) : 0;

  const now = new Date();

  // Update scan record
  await db
    .update(scans)
    .set({
      status: "completed",
      pagesScanned: scannedPages,
      complianceScore,
      violationCounts: totalCounts,
      durationMs,
      completedAt: now,
    })
    .where(eq(scans.id, scanId));

  // Update site with latest score
  await db
    .update(sites)
    .set({
      complianceScore,
      lastScanAt: now,
      updatedAt: now,
    })
    .where(eq(sites.id, siteId));

  return complianceScore;
}

/**
 * Mark a scan as failed with an error message.
 */
export async function failScan(
  scanId: string,
  errorMessage: string,
  durationMs: number
): Promise<void> {
  await db
    .update(scans)
    .set({
      status: "failed",
      errorMessage,
      durationMs,
      completedAt: new Date(),
    })
    .where(eq(scans.id, scanId));
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scanner/src/results.ts
git commit -m "feat(scanner): add results writer for scan pages and violations"
```

---

## Task 8: BullMQ Worker (Job Orchestrator)

**Files:**
- Create: `apps/scanner/src/worker.ts`

- [ ] **Step 1: Create worker**

Create `apps/scanner/src/worker.ts`:

```typescript
import { Worker, type Job } from "bullmq";
import { db, eq } from "@access-audit/db";
import { scans } from "@access-audit/db/schema";
import { redis } from "./redis.js";
import { config } from "./config.js";
import { getBrowser } from "./browser.js";
import { discoverPages } from "./crawler.js";
import { scanPages } from "./scanner.js";
import { writePageResult, finalizeScan, failScan } from "./results.js";
import { publishProgress } from "./progress.js";
import type { ScanJob } from "./types.js";

export function createWorker(): Worker<ScanJob> {
  const worker = new Worker<ScanJob>(
    "scan",
    async (job: Job<ScanJob>) => {
      const { scanId, siteId, url, maxPages } = job.data;
      const start = Date.now();

      try {
        // Update scan status to crawling
        await db
          .update(scans)
          .set({ status: "crawling", startedAt: new Date() })
          .where(eq(scans.id, scanId));

        await publishProgress(scanId, { event: "crawl_start", scanId });

        // Discover pages
        const browser = await getBrowser();
        const urls = await discoverPages(browser, url, maxPages);

        await db
          .update(scans)
          .set({ status: "scanning", pagesFound: urls.length })
          .where(eq(scans.id, scanId));

        await publishProgress(scanId, {
          event: "crawl_complete",
          scanId,
          totalPages: urls.length,
        });

        if (urls.length === 0) {
          const duration = Date.now() - start;
          await finalizeScan(scanId, siteId, [], duration);
          await publishProgress(scanId, {
            event: "scan_complete",
            scanId,
            complianceScore: 0,
          });
          return;
        }

        // Scan pages with progress reporting
        let pagesScanned = 0;
        const results = await scanPages(browser, urls, async (result) => {
          pagesScanned++;
          await writePageResult(scanId, result);
          await publishProgress(scanId, {
            event: "page_scanned",
            scanId,
            pagesScanned,
            totalPages: urls.length,
            currentUrl: result.url,
          });
        });

        // Finalize
        const duration = Date.now() - start;
        const complianceScore = await finalizeScan(
          scanId,
          siteId,
          results,
          duration
        );

        await publishProgress(scanId, {
          event: "scan_complete",
          scanId,
          complianceScore,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const duration = Date.now() - start;
        await failScan(scanId, errorMessage, duration);
        await publishProgress(scanId, {
          event: "scan_failed",
          scanId,
          error: errorMessage,
        });
        throw err; // Re-throw so BullMQ marks job as failed and retries
      }
    },
    {
      connection: redis,
      concurrency: 1,
      limiter: {
        max: 1,
        duration: 1000,
      },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  return worker;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/scanner/src/worker.ts
git commit -m "feat(scanner): add BullMQ worker with crawl → scan → write pipeline"
```

---

## Task 9: Fastify Health Server + Entry Point

**Files:**
- Create: `apps/scanner/src/server.ts`
- Create: `apps/scanner/src/index.ts`

- [ ] **Step 1: Create health server**

Create `apps/scanner/src/server.ts`:

```typescript
import Fastify from "fastify";
import { config } from "./config.js";

export async function startServer(): Promise<void> {
  const fastify = Fastify({ logger: true });

  fastify.get("/health", async () => {
    return {
      status: "ok",
      uptime: process.uptime(),
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString(),
    };
  });

  await fastify.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[server] Health check server listening on port ${config.port}`);
}
```

- [ ] **Step 2: Create entry point**

Create `apps/scanner/src/index.ts`:

```typescript
import { config } from "./config.js";
import { startServer } from "./server.js";
import { createWorker } from "./worker.js";
import { closeBrowser } from "./browser.js";
import { redis, redisPub } from "./redis.js";

async function main(): Promise<void> {
  console.log("[scanner] Starting scanner service...");

  // Start health check server
  await startServer();

  // Start BullMQ worker
  const worker = createWorker();
  console.log("[scanner] Worker listening on 'scan' queue");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[scanner] Shutting down...");
    await worker.close();
    await closeBrowser();
    await redis.quit();
    await redisPub.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[scanner] Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Create .env.example for scanner**

Create `apps/scanner/.env.example`:

```
DATABASE_URL=
UPSTASH_REDIS_URL=
PORT=3001
MAX_CONCURRENT_TABS=4
PAGE_TIMEOUT_MS=30000
JOB_TIMEOUT_MS=600000
```

- [ ] **Step 4: Commit**

```bash
git add apps/scanner/src/server.ts apps/scanner/src/index.ts apps/scanner/.env.example
git commit -m "feat(scanner): add Fastify health server and service entry point"
```

---

## Task 10: Web App — Redis Client + Scan Queue

**Files:**
- Create: `apps/web/src/lib/redis.ts`
- Create: `apps/web/src/lib/scan-queue.ts`

- [ ] **Step 1: Install bullmq and ioredis in web app**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web && pnpm add bullmq ioredis`

- [ ] **Step 2: Create Redis client for web app**

Create `apps/web/src/lib/redis.ts`:

```typescript
import Redis from "ioredis";

const getRedisUrl = () => {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) throw new Error("UPSTASH_REDIS_URL is not set");
  return url;
};

export const redis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: null,
});
```

- [ ] **Step 3: Create scan queue**

Create `apps/web/src/lib/scan-queue.ts`:

```typescript
import { Queue } from "bullmq";
import { redis } from "./redis";

export interface ScanJobData {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}

export const scanQueue = new Queue<ScanJobData>("scan", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/redis.ts apps/web/src/lib/scan-queue.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add Redis client and BullMQ scan queue for job dispatch"
```

---

## Task 11: tRPC Scans Router

**Files:**
- Create: `apps/web/src/trpc/routers/scans.ts`
- Modify: `apps/web/src/trpc/routers/_app.ts`

- [ ] **Step 1: Create scans router**

Create `apps/web/src/trpc/routers/scans.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { scans, scanPages, sites } from "@access-audit/db/schema";
import { eq, and, desc, count } from "@access-audit/db";
import { scanQueue } from "@/lib/scan-queue";
import { organizationSettings } from "@access-audit/db/schema";

export const scansRouter = createTRPCRouter({
  trigger: orgProcedure("member")
    .input(
      z.object({
        siteId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify site belongs to this org
      const [site] = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      // Get max pages from plan
      const [settings] = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const maxPages = settings?.scanQuota ?? 50;

      // Create scan record
      const [scan] = await ctx.db
        .insert(scans)
        .values({
          siteId: input.siteId,
          triggeredBy: "manual",
          status: "queued",
        })
        .returning();

      if (!scan) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create scan",
        });
      }

      // Enqueue BullMQ job
      await scanQueue.add("scan", {
        scanId: scan.id,
        siteId: input.siteId,
        url: site.url,
        maxPages,
      });

      return scan;
    }),

  triggerBulk: orgProcedure("admin").mutation(async ({ ctx }) => {
    const orgSites = await ctx.db
      .select()
      .from(sites)
      .where(
        and(
          eq(sites.organizationId, ctx.orgId),
          eq(sites.status, "active")
        )
      );

    const [settings] = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.orgId));

    const maxPages = settings?.scanQuota ?? 50;

    const createdScans = [];
    for (const site of orgSites) {
      const [scan] = await ctx.db
        .insert(scans)
        .values({
          siteId: site.id,
          triggeredBy: "bulk",
          status: "queued",
        })
        .returning();

      if (scan) {
        await scanQueue.add("scan", {
          scanId: scan.id,
          siteId: site.id,
          url: site.url,
          maxPages,
        });
        createdScans.push(scan);
      }
    }

    return { count: createdScans.length, scans: createdScans };
  }),

  getById: orgProcedure("viewer")
    .input(z.object({ scanId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [scan] = await ctx.db
        .select()
        .from(scans)
        .innerJoin(sites, eq(scans.siteId, sites.id))
        .where(
          and(
            eq(scans.id, input.scanId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

      const pages = await ctx.db
        .select()
        .from(scanPages)
        .where(eq(scanPages.scanId, input.scanId))
        .orderBy(scanPages.createdAt);

      return { ...scan.scans, pages };
    }),

  listBySite: orgProcedure("viewer")
    .input(
      z.object({
        siteId: z.string().uuid(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify site belongs to org
      const [site] = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const results = await ctx.db
        .select()
        .from(scans)
        .where(eq(scans.siteId, input.siteId))
        .orderBy(desc(scans.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [total] = await ctx.db
        .select({ count: count() })
        .from(scans)
        .where(eq(scans.siteId, input.siteId));

      return { scans: results, total: total?.count ?? 0 };
    }),

  getProgress: orgProcedure("viewer")
    .input(z.object({ scanId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [scan] = await ctx.db
        .select({
          id: scans.id,
          status: scans.status,
          pagesFound: scans.pagesFound,
          pagesScanned: scans.pagesScanned,
          complianceScore: scans.complianceScore,
          errorMessage: scans.errorMessage,
        })
        .from(scans)
        .innerJoin(sites, eq(scans.siteId, sites.id))
        .where(
          and(
            eq(scans.id, input.scanId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

      return scan;
    }),
});
```

- [ ] **Step 2: Create violations router**

Create `apps/web/src/trpc/routers/violations.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import {
  violations,
  scans,
  scanPages,
  sites,
} from "@access-audit/db/schema";
import { eq, and, desc, count } from "@access-audit/db";

export const violationsRouter = createTRPCRouter({
  listByScan: orgProcedure("viewer")
    .input(
      z.object({
        scanId: z.string().uuid(),
        impact: z
          .enum(["critical", "serious", "moderate", "minor"])
          .optional(),
        status: z.enum(["open", "fixed", "ignored"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify scan belongs to org
      const [scan] = await ctx.db
        .select()
        .from(scans)
        .innerJoin(sites, eq(scans.siteId, sites.id))
        .where(
          and(
            eq(scans.id, input.scanId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan not found" });
      }

      const conditions = [eq(violations.scanId, input.scanId)];
      if (input.impact) conditions.push(eq(violations.impact, input.impact));
      if (input.status) conditions.push(eq(violations.status, input.status));

      const results = await ctx.db
        .select()
        .from(violations)
        .where(and(...conditions))
        .orderBy(desc(violations.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [total] = await ctx.db
        .select({ count: count() })
        .from(violations)
        .where(and(...conditions));

      return { violations: results, total: total?.count ?? 0 };
    }),

  listByPage: orgProcedure("viewer")
    .input(
      z.object({
        scanPageId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify page's scan belongs to org
      const [page] = await ctx.db
        .select()
        .from(scanPages)
        .innerJoin(scans, eq(scanPages.scanId, scans.id))
        .innerJoin(sites, eq(scans.siteId, sites.id))
        .where(
          and(
            eq(scanPages.id, input.scanPageId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!page) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      }

      const results = await ctx.db
        .select()
        .from(violations)
        .where(eq(violations.scanPageId, input.scanPageId))
        .orderBy(violations.impact);

      return results;
    }),

  updateStatus: orgProcedure("member")
    .input(
      z.object({
        violationId: z.string().uuid(),
        status: z.enum(["open", "fixed", "ignored"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify violation's scan belongs to org
      const [violation] = await ctx.db
        .select()
        .from(violations)
        .innerJoin(scans, eq(violations.scanId, scans.id))
        .innerJoin(sites, eq(scans.siteId, sites.id))
        .where(
          and(
            eq(violations.id, input.violationId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!violation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Violation not found",
        });
      }

      const [updated] = await ctx.db
        .update(violations)
        .set({ status: input.status })
        .where(eq(violations.id, input.violationId))
        .returning();

      return updated;
    }),
});
```

- [ ] **Step 3: Register routers in app router**

Edit `apps/web/src/trpc/routers/_app.ts`:

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/trpc/routers/scans.ts apps/web/src/trpc/routers/violations.ts apps/web/src/trpc/routers/_app.ts
git commit -m "feat(web): add tRPC scans and violations routers with queue dispatch"
```

---

## Task 12: Vercel Cron Endpoint for Scheduled Scans

**Files:**
- Create: `apps/web/src/app/api/cron/scan/route.ts`
- Create: `apps/web/vercel.json`

- [ ] **Step 1: Create cron route handler**

Create `apps/web/src/app/api/cron/scan/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db, eq, and } from "@access-audit/db";
import { sites, scans } from "@access-audit/db/schema";
import { scanQueue } from "@/lib/scan-queue";
import { sql } from "drizzle-orm";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all active sites due for scanning based on their frequency
  const dueSites = await db
    .select()
    .from(sites)
    .where(
      and(
        eq(sites.status, "active"),
        sql`(
          (${sites.scanFrequency} = 'hourly' AND (${sites.lastScanAt} IS NULL OR ${sites.lastScanAt} < ${new Date(now.getTime() - 60 * 60 * 1000)}))
          OR (${sites.scanFrequency} = 'daily' AND (${sites.lastScanAt} IS NULL OR ${sites.lastScanAt} < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}))
          OR (${sites.scanFrequency} = 'weekly' AND (${sites.lastScanAt} IS NULL OR ${sites.lastScanAt} < ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)}))
          OR (${sites.scanFrequency} = 'monthly' AND (${sites.lastScanAt} IS NULL OR ${sites.lastScanAt} < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}))
        )`
      )
    );

  let enqueued = 0;

  for (const site of dueSites) {
    // Skip sites with frequency "manual"
    if (site.scanFrequency === "manual") continue;

    const [scan] = await db
      .insert(scans)
      .values({
        siteId: site.id,
        triggeredBy: "scheduled",
        status: "queued",
      })
      .returning();

    if (scan) {
      await scanQueue.add("scan", {
        scanId: scan.id,
        siteId: site.id,
        url: site.url,
        maxPages: 50, // Default for scheduled scans
      });
      enqueued++;
    }
  }

  return NextResponse.json({
    success: true,
    sitesChecked: dueSites.length,
    scansEnqueued: enqueued,
    timestamp: now.toISOString(),
  });
}
```

- [ ] **Step 2: Create vercel.json**

Create `apps/web/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/scan",
      "schedule": "0 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/cron/scan/route.ts apps/web/vercel.json
git commit -m "feat(web): add Vercel Cron endpoint for hourly scheduled scan dispatch"
```

---

## Task 13: Verify TypeScript Compilation + End-to-End Smoke Check

**Files:** None (verification only)

- [ ] **Step 1: Verify scanner service compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/scanner && npx tsc --noEmit`

Expected: No TypeScript errors.

- [ ] **Step 2: Verify web app compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web && npx tsc --noEmit`

Expected: No TypeScript errors.

- [ ] **Step 3: Verify db:push still works**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm db:push`

Expected: Schema push succeeds (tables already exist from Task 1, no changes needed).

- [ ] **Step 4: Fix any issues found and commit**

If any compilation or schema errors were found in steps 1-3, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve TypeScript and schema issues from Phase 2 integration"
```

- [ ] **Step 5: Update phases.md**

Edit `docs/phases.md` — change Phase 2 status from "Not Started" to "Complete":

```
| 2 | Scanner service (Puppeteer + axe-core + BullMQ) | Complete | Core product value — can't demo without it |
```

- [ ] **Step 6: Final commit**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 2 scanner service as complete"
```
