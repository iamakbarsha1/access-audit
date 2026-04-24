Phase 2 Design: Scanner Service

Architecture Overview

A standalone Node.js service (apps/scanner) deployed on Railway that:

- Consumes scan jobs from a BullMQ queue (Upstash Redis)
- Launches headless Chromium via Puppeteer
- Discovers pages via hybrid crawling (sitemap + link crawl)
- Scans each page with axe-core for WCAG 2.1 AA violations
- Writes results directly to Neon PostgreSQL via shared @access-audit/db package
- Publishes real-time progress updates via Redis pub/sub
- Exposes a lightweight Fastify HTTP server for health checks

A Vercel Cron endpoint on the Next.js app triggers scheduled scans by querying sites due and enqueuing BullMQ jobs.

Components

1. Scanner Worker (apps/scanner/src/worker.ts)

- BullMQ worker listening on scan queue
- Receives job: { scanId, siteId, url, maxPages }
- Orchestrates the full pipeline: crawl → scan pages → write results → update scan status
- Concurrency: 1 job at a time (single browser instance)

2. Page Discovery / Crawler (apps/scanner/src/crawler.ts)

- Hybrid strategy: fetch /sitemap.xml first, parse URLs
- Then link-crawl from homepage to find pages not in sitemap
- Deduplicate, filter to same-domain only, respect maxPages limit
- Returns a flat list of URLs to scan

3. Page Scanner (apps/scanner/src/scanner.ts)

- Takes a browser instance + list of URLs
- Opens pages in concurrent tabs (max 4 via p-limit)
- Each tab: navigate → wait for load → inject @axe-core/puppeteer → run analysis → collect results → close tab
- Per-page timeout (30s) and retry (2 attempts with backoff)
- Returns structured results per page

4. Results Writer (apps/scanner/src/results.ts)

- Writes scan_pages records (one per page scanned)
- Writes violations records (one per violation instance)
- Updates parent scans record with final compliance score, violation counts, status
- Updates sites table with latest complianceScore
- All within a transaction for consistency

5. Progress Publisher (apps/scanner/src/progress.ts)

- Publishes to Redis channel scan:{scanId}:progress
- Events: crawl_complete, page_scanned, scan_complete, scan_failed
- Payload includes: { scanId, event, pagesScanned, totalPages, currentUrl }

6. Fastify Health Server (apps/scanner/src/server.ts)

- GET /health — returns 200 + worker status, active jobs, memory usage
- Runs on port from PORT env var (Railway sets this)

7. Vercel Cron Endpoint (apps/web/src/app/api/cron/scan/route.ts)

- Runs hourly via vercel.json cron config
- Queries sites where nextScanAt <= now based on scanFrequency and lastScanAt
- Enqueues a BullMQ job per site due for scanning
- Updates nextScanAt on each site
- Secured with CRON_SECRET header verification

Database Schema Additions

scans table:

- id, siteId, triggeredBy (manual/scheduled/bulk), status (queued/crawling/scanning/completed/failed), pagesFound, pagesScanned, complianceScore, violationCounts (JSON: {critical, serious, moderate, minor}),
  errorMessage, durationMs, startedAt, completedAt, createdAt

scan_pages table:

- id, scanId, url, status (scanned/failed/skipped), complianceScore, violationCounts (JSON), errorMessage, durationMs, createdAt

violations table:

- id, scanId, scanPageId, ruleId, impact (critical/serious/moderate/minor), wcagTags (JSON array), description, helpUrl, htmlSnippet, selector, aiExplanation (null for Phase 2, filled in Phase 3), aiFixCode
  (null for Phase 2), status (open/fixed/ignored), createdAt

Job Flow

User clicks "Scan" → tRPC mutation creates `scans` row (status: queued)
→ Enqueues BullMQ job { scanId, siteId, url, maxPages }
→ Returns scanId to frontend

Scanner worker picks up job
→ Updates scan status: "crawling"
→ Publishes progress: crawl_start
→ Crawler fetches sitemap + link-crawls → URL list
→ Updates scan: pagesFound = N, status: "scanning"
→ Publishes progress: crawl_complete { totalPages: N }
→ Scanner processes pages (4 concurrent tabs)
→ Per page: navigate → axe-core → write scan_page + violations
→ Publishes progress: page_scanned { current, total, url }
→ Calculates overall compliance score
→ Updates scan: status "completed", complianceScore, violationCounts
→ Updates site: complianceScore, lastScanAt
→ Publishes progress: scan_complete

Frontend polls scan status via tRPC OR subscribes to Redis pub/sub for live updates

Retry & Error Handling

- Page level: 2 retries with exponential backoff (1s, 3s). On persistent failure, mark scan_page as failed with error, continue scanning other pages.
- Job level: BullMQ attempts: 2 with 30s delay. On persistent failure, mark scan as failed with error message.
- Browser crash: Catch unhandled browser disconnection, attempt browser relaunch once per job. If relaunch fails, fail the job.
- Timeout: 30s per page navigation, 60s per page total (including axe analysis). 10-minute max per scan job.

Communication: Web App ↔ Scanner

- Job dispatch: Web app → BullMQ queue (Upstash Redis) → Scanner worker
- Results: Scanner → direct DB writes to Neon PostgreSQL
- Real-time progress: Scanner → Redis pub/sub → Web app (tRPC subscription or SSE endpoint)
- Scheduling: Vercel Cron → API route → BullMQ queue → Scanner

Post-MRR Upgrade Path

- Option 3 browser pool: Wrap existing single-browser logic in generic-pool. No scanning code changes needed.
- Phase 3 AI layer: After violations are written, a separate job (or Phase 3 pipeline) reads violations and calls Claude Haiku to populate aiExplanation and aiFixCode fields.

Phase 3 Design: AI Fix Suggestions

Architecture

The scanner service gets a new module (ai-suggestions.ts) and the existing worker gets a second job type. Flow:

Scan completes → worker enqueues "ai-suggestions" job → worker picks it up →
group violations by ruleId → call Claude Haiku per group → update DB rows

Components

1. Anthropic SDK client (apps/scanner/src/ai-client.ts)

- Singleton Anthropic client, reads ANTHROPIC_API_KEY from env
- Single function: generateFixSuggestions(ruleId, description, helpUrl, wcagTags, violations[]) → { explanation, fixes[] }
- JSON response parsing with validation
- Retry on API errors (3 attempts, exponential backoff)

2. AI suggestions processor (apps/scanner/src/ai-suggestions.ts)

- Takes a scanId, loads all violations for that scan from DB
- Groups by ruleId — each group becomes one Claude API call
- Caps at 20 violations per call; splits larger groups into chunks
- Calls generateFixSuggestions() per group
- Batch-updates aiExplanation and aiFixCode on each violation row
- Publishes progress events: ai_start, ai_progress, ai_complete, ai_failed

3. Worker routing (modify apps/scanner/src/worker.ts)

- Current: handles "scan" jobs only
- New: also handles "ai-suggestions" jobs
- After scan completes successfully, auto-enqueues "ai-suggestions" job with { scanId }
- AI job failures don't affect scan status

4. Types (modify apps/scanner/src/types.ts)

- AiSuggestionsJob: { scanId: string }
- AiFixResult: { explanation: string; fixes: string[] }
- New progress events: ai_start, ai_progress, ai_complete, ai_failed

5. Config (modify apps/scanner/src/config.ts)

- ANTHROPIC_API_KEY (required for AI jobs, optional for scan-only)
- AI_MAX_VIOLATIONS_PER_PROMPT (default: 20)
- AI_MAX_RETRIES (default: 3)

6. Web app scan queue (modify apps/web/src/lib/scan-queue.ts)

- Update ScanJobData union type to include AiSuggestionsJobData
- No new queue needed

Error handling

- If Claude API is down: AI job fails, violations remain with null AI fields, scan result is still valid
- If individual ruleId group fails: skip it, process remaining groups, partial AI results are fine
- Rate limiting: exponential backoff handles Anthropic rate limits

What this does NOT include

- On-demand generation (post-MRR, Option 3)
- Claude-powered page analysis (Option B, post-MRR)
- UI changes to display AI suggestions (that's Phase 4 dashboard work)

Phase 5 Design: Dodo Payments Billing Integration

Section 1: Architecture Overview

New packages:

- @dodopayments/better-auth — plugin for auth.ts (checkout, portal, webhooks)
- dodopayments — Node.js SDK (client for API calls)

New files:

- packages/db/src/plans.ts — tier config (quotas, features, Dodo product slugs)
- apps/web/src/app/(dashboard)/settings/billing-tab.tsx — compact billing UI
- apps/web/src/app/pricing/page.tsx — public/authenticated pricing page
- apps/web/src/lib/emails/subscription-\*.tsx — email templates (4 templates)
- apps/web/src/trpc/middleware.ts — add paidProcedure middleware

Modified files:

- apps/web/src/lib/auth.ts — add Dodo plugin to Better-Auth config
- apps/web/src/lib/auth-client.ts — add Dodo client plugin
- apps/web/src/trpc/routers/sites.ts — update quota check to use plans config
- apps/web/src/trpc/routers/scans.ts — add scan frequency enforcement
- apps/web/src/app/(dashboard)/settings/page.tsx — replace billing placeholder
- packages/db/src/schema/organizations.ts — minor: ensure plan type is strict enum

Data flow:
User clicks "Upgrade" on /pricing
→ Client calls authClient.dodopayments.checkoutSession({ slug: "agency" })
→ Redirects to Dodo hosted checkout
→ User pays
→ Dodo sends webhook to /api/auth/dodopayments/webhooks
→ Better-Auth plugin verifies signature
→ Our onPayload handler updates organizationSettings (plan, dodoSubscriptionId)
→ Sends confirmation email via Resend
→ User returns to /settings → sees new plan
