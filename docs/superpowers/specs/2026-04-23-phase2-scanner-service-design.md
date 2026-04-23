# Phase 2: Scanner Service — Design Spec

## Overview

A standalone Node.js service (`apps/scanner`) deployed on Railway that scans websites for WCAG 2.1 AA violations using Puppeteer + axe-core. Connected to the Next.js app via BullMQ (Upstash Redis) for job dispatch and Redis pub/sub for real-time progress. Writes results directly to Neon PostgreSQL via the shared `@access-audit/db` package.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scanning scope | Single page + site crawler + scheduling | Full scanning suite in one phase |
| Crawl strategy | Hybrid (sitemap-first + link crawl supplement) | Most sites have sitemaps; link crawl catches stragglers |
| Scheduling | Vercel Cron → BullMQ enqueue | Schedule state in DB, not Redis; free on Vercel |
| Service structure | BullMQ worker + Fastify health server | Railway needs health checks; single process |
| Concurrency | Single browser, 4 concurrent tabs via p-limit | 3-5x faster than sequential, ~300-500MB memory |
| Results communication | Direct DB writes + Redis pub/sub for progress | DB for persistence, pub/sub for real-time UX |
| Retry strategy | 2 per-page retries + 2 BullMQ job attempts | Catches transient failures without dead letter complexity |
| Schema design | Two-level: scan_pages + violations | Per-page compliance scores without aggregation queries |
| Post-MRR upgrade | Browser pool via generic-pool | Drop-in wrapper, no scanning code rewrite |

## Architecture

```
                        Vercel Cron (hourly)
                              |
                              v
Next.js App ──── tRPC mutation ──── BullMQ Queue (Upstash Redis)
     ^                                        |
     |                                        v
     |                              Scanner Worker (Railway)
     |                                   |         |
     |                           Crawl pages   Scan pages (4 tabs)
     |                                   |         |
     |                                   v         v
     |                              Write results to Neon PostgreSQL
     |                                        |
     +---- Redis pub/sub progress events -----+
     |                                        |
     +---- Poll scan status via tRPC ---------+
```

## Components

### 1. Scanner Worker — `apps/scanner/src/worker.ts`

BullMQ worker listening on the `scan` queue.

**Job payload:**
```typescript
interface ScanJob {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}
```

**Responsibilities:**
- Consume jobs from the `scan` queue
- Orchestrate the pipeline: crawl → scan → write results → update status
- Manage browser lifecycle (launch on startup, relaunch on crash)
- Concurrency: 1 job at a time (single browser instance)

**BullMQ config:**
```typescript
{
  attempts: 2,
  backoff: { type: 'exponential', delay: 30000 },
  timeout: 600000 // 10 minute max per job
}
```

### 2. Page Discovery / Crawler — `apps/scanner/src/crawler.ts`

Hybrid crawl strategy to discover pages on a site.

**Algorithm:**
1. Fetch `{rootUrl}/sitemap.xml` — parse all `<loc>` entries
2. If sitemap found, collect URLs (filter to same domain, respect maxPages)
3. Link-crawl from homepage: extract all internal `<a href>` links via Puppeteer
4. Merge sitemap URLs + crawled URLs, deduplicate
5. Truncate to `maxPages` limit
6. Return flat URL list

**Edge cases:**
- Sitemap index files (sitemap of sitemaps) — follow one level deep
- Relative URLs — resolve against root domain
- Fragment/query variations — normalize before dedup
- robots.txt — respect `Disallow` rules
- Non-HTML resources — filter out PDFs, images, etc.

### 3. Page Scanner — `apps/scanner/src/scanner.ts`

Scans individual pages for WCAG violations using axe-core.

**Per-page flow:**
1. Open new tab in shared browser instance
2. Navigate to URL, wait for `networkidle0` (max 30s timeout)
3. Inject and run `@axe-core/puppeteer` with WCAG 2.1 AA ruleset
4. Collect violations, passes, and incomplete results
5. Close tab, return structured results

**Concurrency:**
- `p-limit(4)` — max 4 tabs open simultaneously
- `Promise.allSettled` — one page failure doesn't abort others

**Per-page retry:**
- 2 attempts with exponential backoff (1s, 3s)
- On persistent failure: mark page as `failed`, continue to next

**Timeouts:**
- 30s for page navigation
- 60s total per page (navigation + axe analysis)

### 4. Results Writer — `apps/scanner/src/results.ts`

Persists scan results to Neon PostgreSQL.

**Write sequence (per page):**
1. Insert `scan_pages` row with page-level stats
2. Batch insert `violations` rows for that page
3. Update `scans` row: increment `pagesScanned`, update `status`

**On scan completion:**
1. Calculate overall compliance score: `(total_passes / (total_passes + total_violations)) * 100`
2. Update `scans`: status → `completed`, set `complianceScore`, `violationCounts`, `completedAt`, `durationMs`
3. Update `sites`: set `complianceScore`, `lastScanAt`

All writes use the shared `@access-audit/db` Drizzle client.

### 5. Progress Publisher — `apps/scanner/src/progress.ts`

Publishes real-time scan progress via Redis pub/sub.

**Channel:** `scan:{scanId}:progress`

**Events:**
```typescript
type ProgressEvent =
  | { event: 'crawl_start'; scanId: string }
  | { event: 'crawl_complete'; scanId: string; totalPages: number }
  | { event: 'page_scanned'; scanId: string; pagesScanned: number; totalPages: number; currentUrl: string }
  | { event: 'scan_complete'; scanId: string; complianceScore: number }
  | { event: 'scan_failed'; scanId: string; error: string };
```

The web app can subscribe to this channel for live progress updates, or fall back to polling the `scans` table via tRPC.

### 6. Fastify Health Server — `apps/scanner/src/server.ts`

Lightweight HTTP server for Railway health checks.

**Endpoints:**
- `GET /health` — returns 200 + JSON: `{ status, activeJobs, uptime, memoryUsage }`

**Config:**
- Port from `PORT` env var (Railway sets this automatically)
- Starts alongside the BullMQ worker in the same process

### 7. Vercel Cron Endpoint — `apps/web/src/app/api/cron/scan/route.ts`

Hourly cron trigger for scheduled scans.

**Logic:**
1. Verify `CRON_SECRET` header (Vercel sends this automatically)
2. Query all active sites where scan is due:
   - `scanFrequency = 'hourly'` and `lastScanAt < 1 hour ago`
   - `scanFrequency = 'daily'` and `lastScanAt < 24 hours ago`
   - `scanFrequency = 'weekly'` and `lastScanAt < 7 days ago`
   - `scanFrequency = 'monthly'` and `lastScanAt < 30 days ago`
3. For each site due: create `scans` row (status: queued), enqueue BullMQ job
4. Return count of jobs enqueued

**Vercel config (`vercel.json`):**
```json
{
  "crons": [
    { "path": "/api/cron/scan", "schedule": "0 * * * *" }
  ]
}
```

## Database Schema

### `scans` table

```typescript
export const scans = pgTable("scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("siteId").notNull().references(() => sites.id, { onDelete: "cascade" }),
  triggeredBy: text("triggeredBy").notNull(), // "manual" | "scheduled" | "bulk"
  status: text("status").notNull().default("queued"), // queued | crawling | scanning | completed | failed
  pagesFound: integer("pagesFound"),
  pagesScanned: integer("pagesScanned").default(0),
  complianceScore: integer("complianceScore"),
  violationCounts: jsonb("violationCounts"), // { critical: N, serious: N, moderate: N, minor: N }
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

### `scan_pages` table

```typescript
export const scanPages = pgTable("scan_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scanId").notNull().references(() => scans.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: text("status").notNull(), // "scanned" | "failed" | "skipped"
  complianceScore: integer("complianceScore"),
  violationCounts: jsonb("violationCounts"), // { critical: N, serious: N, moderate: N, minor: N }
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

### `violations` table

```typescript
export const violations = pgTable("violations", {
  id: uuid("id").defaultRandom().primaryKey(),
  scanId: uuid("scanId").notNull().references(() => scans.id, { onDelete: "cascade" }),
  scanPageId: uuid("scanPageId").notNull().references(() => scanPages.id, { onDelete: "cascade" }),
  ruleId: text("ruleId").notNull(), // axe-core rule ID, e.g. "image-alt"
  impact: text("impact").notNull(), // "critical" | "serious" | "moderate" | "minor"
  wcagTags: jsonb("wcagTags"), // ["wcag2a", "wcag211", ...]
  description: text("description").notNull(),
  helpUrl: text("helpUrl"),
  htmlSnippet: text("htmlSnippet"),
  selector: text("selector"),
  aiExplanation: text("aiExplanation"), // null until Phase 3
  aiFixCode: text("aiFixCode"), // null until Phase 3
  status: text("status").notNull().default("open"), // "open" | "fixed" | "ignored"
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
```

### Sites table modification

Add `lastScanAt` and `nextScanAt` columns to existing `sites` table:

```typescript
lastScanAt: timestamp("lastScanAt"),
nextScanAt: timestamp("nextScanAt"),
```

## tRPC Routes (Web App Side)

### `scans` router — `apps/web/src/trpc/routers/scans.ts`

- `scans.trigger` — Create scan record + enqueue BullMQ job for a site
- `scans.triggerBulk` — Trigger scans for all sites in an organization
- `scans.getById` — Get scan with page results and violation counts
- `scans.listBySite` — Paginated scan history for a site
- `scans.getProgress` — Get current scan status (for polling)

### `violations` router — `apps/web/src/trpc/routers/violations.ts`

- `violations.listByScan` — All violations for a scan, filterable by impact/status
- `violations.listByPage` — Violations for a specific scan_page
- `violations.updateStatus` — Mark violation as fixed/ignored

## Environment Variables

### Scanner Service (`apps/scanner/.env`)

```
DATABASE_URL=           # Neon PostgreSQL connection string
UPSTASH_REDIS_URL=      # Upstash Redis URL for BullMQ + pub/sub
PORT=                   # Railway sets this automatically
NODE_ENV=production
MAX_CONCURRENT_TABS=4   # Puppeteer tab concurrency
PAGE_TIMEOUT_MS=30000   # Per-page navigation timeout
JOB_TIMEOUT_MS=600000   # Max time per scan job (10 min)
```

### Web App additions (`apps/web/.env`)

```
UPSTASH_REDIS_URL=      # Same Redis for enqueuing jobs + subscribing to progress
CRON_SECRET=            # Vercel cron authentication
```

## Error Handling

| Failure | Handling |
|---------|----------|
| Page navigation timeout (30s) | Retry page 2x with backoff. On failure: mark scan_page as `failed`, continue. |
| axe-core injection/run failure | Retry page once. On failure: mark scan_page as `failed`, continue. |
| Browser crash/disconnect | Attempt browser relaunch once. On failure: fail the job (BullMQ retries). |
| BullMQ job timeout (10min) | Job marked failed. BullMQ retries once after 30s delay. |
| All retries exhausted | Scan marked `failed` with error message. Partial results preserved. |
| Sitemap fetch failure | Silently fall back to link-crawl only. Not an error. |
| No pages found | Scan marked `completed` with 0 pages, compliance score null. |

## Package Dependencies

### `apps/scanner/package.json`

```
puppeteer              # Headless Chrome automation
@axe-core/puppeteer    # axe-core integration for Puppeteer
bullmq                 # Job queue worker
ioredis                # Redis client for BullMQ + pub/sub
fastify                # Lightweight HTTP server for health checks
p-limit                # Concurrency limiter for tabs
@access-audit/db       # Shared Drizzle schema + client
dotenv                 # Environment variable loading
```

### Web app additions

```
bullmq                 # For enqueuing jobs
ioredis                # For Redis pub/sub subscription
```

## Post-MRR Upgrade Path

- **Browser pool (Option 3):** Wrap existing single-browser logic in `generic-pool`. Increase BullMQ worker concurrency to match pool size. No scanning code changes.
- **Phase 3 AI layer:** After violations are written, a separate BullMQ job reads violations and calls Claude Haiku to populate `aiExplanation` and `aiFixCode` fields.
