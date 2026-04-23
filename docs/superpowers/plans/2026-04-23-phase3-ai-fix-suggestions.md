# Phase 3: AI Fix Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude Haiku integration to generate plain-English explanations and fix code for WCAG violations, running as a post-scan batch job.

**Architecture:** After a scan completes, the worker auto-enqueues an `"ai-suggestions"` job on the same BullMQ queue. That job loads violations from DB, groups by `ruleId`, calls Claude Haiku once per group (max 20 violations per prompt), and batch-updates `aiExplanation` + `aiFixCode` on each violation row.

**Tech Stack:** `@anthropic-ai/sdk`, BullMQ (existing), Drizzle ORM (existing), Puppeteer (existing)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/scanner/package.json` | Modify | Add `@anthropic-ai/sdk` dependency |
| `apps/scanner/src/config.ts` | Modify | Add AI config (API key, model, limits) |
| `apps/scanner/src/types.ts` | Modify | Add `AiSuggestionsJob`, `AiFixResult`, AI progress events |
| `apps/scanner/src/ai-client.ts` | Create | Anthropic SDK wrapper, prompt, JSON parsing, retry |
| `apps/scanner/src/ai-suggestions.ts` | Create | Orchestrator: load violations, group, call AI, update DB |
| `apps/scanner/src/worker.ts` | Modify | Job routing (`"scan"` vs `"ai-suggestions"`), auto-enqueue after scan |
| `apps/web/src/lib/scan-queue.ts` | Modify | Update job data type to union |

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `apps/scanner/package.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm add @anthropic-ai/sdk --filter @access-audit/scanner
```

- [ ] **Step 2: Verify installation**

Run: `cat apps/scanner/package.json | grep anthropic`

Expected: `"@anthropic-ai/sdk": "^0.x.x"` appears in dependencies.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/package.json pnpm-lock.yaml
git commit -m "feat(scanner): add @anthropic-ai/sdk dependency for AI fix suggestions"
```

---

## Task 2: Extend Config and Types

**Files:**
- Modify: `apps/scanner/src/config.ts`
- Modify: `apps/scanner/src/types.ts`

- [ ] **Step 1: Update config**

Edit `apps/scanner/src/config.ts` to add AI configuration. The full file should be:

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
  // AI configuration
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  aiModel: process.env.AI_MODEL || "claude-haiku-4-5-20251001",
  aiMaxViolationsPerPrompt: parseInt(process.env.AI_MAX_VIOLATIONS_PER_PROMPT || "20", 10),
  aiMaxRetries: parseInt(process.env.AI_MAX_RETRIES || "3", 10),
  aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS || "30000", 10),
} as const;
```

Note: `anthropicApiKey` is NOT required at boot — it's validated at AI job start only.

- [ ] **Step 2: Update types**

Edit `apps/scanner/src/types.ts`. The full file should be:

```typescript
export interface ScanJob {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}

export interface AiSuggestionsJob {
  scanId: string;
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

export interface AiFixResult {
  explanation: string;
  fixes: string[];
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
  | { event: "scan_failed"; scanId: string; error: string }
  | { event: "ai_start"; scanId: string; totalGroups: number }
  | {
      event: "ai_progress";
      scanId: string;
      groupsProcessed: number;
      totalGroups: number;
      currentRule: string;
    }
  | { event: "ai_complete"; scanId: string }
  | { event: "ai_failed"; scanId: string; error: string };
```

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/src/config.ts apps/scanner/src/types.ts
git commit -m "feat(scanner): add AI config and types for fix suggestions"
```

---

## Task 3: Create Anthropic SDK Client

**Files:**
- Create: `apps/scanner/src/ai-client.ts`

- [ ] **Step 1: Create the AI client module**

Create `apps/scanner/src/ai-client.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { AiFixResult } from "./types.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot process AI suggestions");
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

interface ViolationInput {
  id: string;
  htmlSnippet: string;
  selector: string;
}

interface GenerateInput {
  ruleId: string;
  description: string;
  helpUrl: string;
  wcagTags: string[];
  violations: ViolationInput[];
}

function buildPrompt(input: GenerateInput): string {
  const truncate = (s: string, max: number) =>
    s.length > max ? s.slice(0, max) + "..." : s;

  const elements = input.violations
    .map(
      (v, i) =>
        `${i + 1}. Selector: ${v.selector}\n   HTML: ${truncate(v.htmlSnippet, 500)}`
    )
    .join("\n\n");

  return `A WCAG audit found violations of rule "${input.ruleId}".

Rule: ${input.description}
WCAG tags: ${input.wcagTags.join(", ")}
Reference: ${input.helpUrl}

The following ${input.violations.length} HTML elements violate this rule:

${elements}

Provide:
1. "explanation" — A plain-English explanation of why this is an accessibility problem (2-3 sentences, for a non-technical audience)
2. "fixes" — An array with one corrected HTML snippet per element above, in the same order`;
}

function parseResponse(text: string): AiFixResult {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

  if (
    typeof parsed.explanation !== "string" ||
    !Array.isArray(parsed.fixes) ||
    !parsed.fixes.every((f: unknown) => typeof f === "string")
  ) {
    throw new Error("Invalid AI response structure: missing explanation or fixes array");
  }

  return {
    explanation: parsed.explanation,
    fixes: parsed.fixes,
  };
}

export async function generateFixSuggestions(
  input: GenerateInput
): Promise<AiFixResult> {
  const anthropic = getClient();

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.aiMaxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: config.aiModel,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
        system:
          "You are an accessibility expert helping developers fix WCAG violations. Respond ONLY with valid JSON matching this schema: { \"explanation\": string, \"fixes\": string[] }",
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in AI response");
      }

      return parseResponse(textBlock.text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on validation/parse errors from our side
      if (lastError.message.includes("Invalid AI response structure")) {
        if (attempt < config.aiMaxRetries) {
          console.warn(
            `[ai-client] Invalid response for rule "${input.ruleId}", retrying (${attempt}/${config.aiMaxRetries})`
          );
          await sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        throw lastError;
      }

      // Retry on transient API errors (rate limits, 500s)
      if (attempt < config.aiMaxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.warn(
          `[ai-client] API error for rule "${input.ruleId}", retrying in ${delay}ms (${attempt}/${config.aiMaxRetries}): ${lastError.message}`
        );
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError ?? new Error("AI generation failed after all retries");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/scanner && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/src/ai-client.ts
git commit -m "feat(scanner): add Anthropic SDK client with prompt, retry, and JSON parsing"
```

---

## Task 4: Create AI Suggestions Processor

**Files:**
- Create: `apps/scanner/src/ai-suggestions.ts`

- [ ] **Step 1: Create the orchestrator module**

Create `apps/scanner/src/ai-suggestions.ts`:

```typescript
import { db, eq } from "@access-audit/db";
import { violations as violationsTable } from "@access-audit/db/schema";
import { generateFixSuggestions } from "./ai-client.js";
import { publishProgress } from "./progress.js";
import { config } from "./config.js";

interface ViolationRow {
  id: string;
  ruleId: string;
  description: string;
  helpUrl: string | null;
  wcagTags: string[] | null;
  htmlSnippet: string | null;
  selector: string | null;
}

/**
 * Process AI fix suggestions for all violations in a scan.
 * Groups violations by ruleId, calls Claude Haiku per group,
 * updates aiExplanation + aiFixCode on each violation row.
 */
export async function processAiSuggestions(scanId: string): Promise<void> {
  // Load all violations for this scan
  const allViolations = await db
    .select({
      id: violationsTable.id,
      ruleId: violationsTable.ruleId,
      description: violationsTable.description,
      helpUrl: violationsTable.helpUrl,
      wcagTags: violationsTable.wcagTags,
      htmlSnippet: violationsTable.htmlSnippet,
      selector: violationsTable.selector,
    })
    .from(violationsTable)
    .where(eq(violationsTable.scanId, scanId));

  if (allViolations.length === 0) {
    console.log(`[ai-suggestions] No violations for scan ${scanId}, skipping`);
    await publishProgress(scanId, { event: "ai_complete", scanId });
    return;
  }

  // Group violations by ruleId
  const groups = new Map<string, ViolationRow[]>();
  for (const v of allViolations) {
    const existing = groups.get(v.ruleId) ?? [];
    existing.push(v);
    groups.set(v.ruleId, existing);
  }

  const totalGroups = groups.size;
  console.log(
    `[ai-suggestions] Processing ${allViolations.length} violations in ${totalGroups} rule groups for scan ${scanId}`
  );

  await publishProgress(scanId, {
    event: "ai_start",
    scanId,
    totalGroups,
  });

  let groupsProcessed = 0;

  for (const [ruleId, ruleViolations] of groups) {
    try {
      // Chunk into batches of max N violations per prompt
      const maxPerPrompt = config.aiMaxViolationsPerPrompt;
      const chunks: ViolationRow[][] = [];
      for (let i = 0; i < ruleViolations.length; i += maxPerPrompt) {
        chunks.push(ruleViolations.slice(i, i + maxPerPrompt));
      }

      let sharedExplanation: string | null = null;

      for (const chunk of chunks) {
        // Use first violation's metadata for the prompt (all share the same rule)
        const first = chunk[0];

        const result = await generateFixSuggestions({
          ruleId,
          description: first.description,
          helpUrl: first.helpUrl ?? "",
          wcagTags: first.wcagTags ?? [],
          violations: chunk.map((v) => ({
            id: v.id,
            htmlSnippet: v.htmlSnippet ?? "",
            selector: v.selector ?? "",
          })),
        });

        // First chunk's explanation is used for all violations in the group
        if (!sharedExplanation) {
          sharedExplanation = result.explanation;
        }

        // Update each violation with AI results
        for (let i = 0; i < chunk.length; i++) {
          const fixCode = result.fixes[i] ?? null;
          await db
            .update(violationsTable)
            .set({
              aiExplanation: sharedExplanation,
              aiFixCode: fixCode,
            })
            .where(eq(violationsTable.id, chunk[i].id));
        }
      }

      groupsProcessed++;
      await publishProgress(scanId, {
        event: "ai_progress",
        scanId,
        groupsProcessed,
        totalGroups,
        currentRule: ruleId,
      });
    } catch (err) {
      // Partial failure: skip this group, continue with remaining
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[ai-suggestions] Failed to process rule "${ruleId}" for scan ${scanId}: ${errorMsg}`
      );
      groupsProcessed++;
    }
  }

  await publishProgress(scanId, { event: "ai_complete", scanId });
  console.log(`[ai-suggestions] Completed AI suggestions for scan ${scanId}`);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/scanner && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/src/ai-suggestions.ts
git commit -m "feat(scanner): add AI suggestions processor with grouping and batch updates"
```

---

## Task 5: Update Worker with Job Routing and Auto-Enqueue

**Files:**
- Modify: `apps/scanner/src/worker.ts`

- [ ] **Step 1: Rewrite worker with job routing**

Replace the contents of `apps/scanner/src/worker.ts` with:

```typescript
import { Worker, Queue, type Job } from "bullmq";
import { db, eq } from "@access-audit/db";
import { scans } from "@access-audit/db/schema";
import { redis } from "./redis.js";
import { config } from "./config.js";
import { getBrowser } from "./browser.js";
import { discoverPages } from "./crawler.js";
import { scanPages } from "./scanner.js";
import { writePageResult, finalizeScan, failScan } from "./results.js";
import { publishProgress } from "./progress.js";
import { processAiSuggestions } from "./ai-suggestions.js";
import type { ScanJob, AiSuggestionsJob } from "./types.js";

// Queue reference for enqueuing AI jobs after scan completes
const scanQueue = new Queue("scan", { connection: redis });

async function handleScanJob(job: Job<ScanJob>): Promise<void> {
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
    const complianceScore = await finalizeScan(scanId, siteId, results, duration);

    await publishProgress(scanId, {
      event: "scan_complete",
      scanId,
      complianceScore,
    });

    // Auto-enqueue AI suggestions job (non-blocking — AI failure doesn't fail the scan)
    if (config.anthropicApiKey) {
      await scanQueue.add(
        "ai-suggestions",
        { scanId } satisfies AiSuggestionsJob,
        {
          jobId: `${scanId}-ai`,
          attempts: 2,
          backoff: { type: "exponential", delay: 10000 },
        }
      );
      console.log(`[worker] Enqueued AI suggestions job for scan ${scanId}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const duration = Date.now() - start;
    await failScan(scanId, errorMessage, duration);
    await publishProgress(scanId, {
      event: "scan_failed",
      scanId,
      error: errorMessage,
    });
    throw err; // Re-throw so BullMQ marks job as failed and retries
  }
}

async function handleAiSuggestionsJob(
  job: Job<AiSuggestionsJob>
): Promise<void> {
  const { scanId } = job.data;
  console.log(`[worker] Processing AI suggestions for scan ${scanId}`);

  try {
    await processAiSuggestions(scanId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] AI suggestions failed for scan ${scanId}: ${errorMsg}`);
    await publishProgress(scanId, {
      event: "ai_failed",
      scanId,
      error: errorMsg,
    });
    throw err;
  }
}

export function createWorker(): Worker {
  const worker = new Worker(
    "scan",
    async (job: Job) => {
      if (job.name === "ai-suggestions") {
        await handleAiSuggestionsJob(job as Job<AiSuggestionsJob>);
      } else {
        await handleScanJob(job as Job<ScanJob>);
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
    console.error(`[worker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} (${job.name}) completed`);
  });

  return worker;
}
```

Key changes from original:
- Worker type changed from `Worker<ScanJob>` to `Worker` (handles multiple job data types)
- Job routing by `job.name`: `"scan"` → `handleScanJob`, `"ai-suggestions"` → `handleAiSuggestionsJob`
- After successful scan, auto-enqueues `"ai-suggestions"` job (only if `ANTHROPIC_API_KEY` is set)
- Queue reference created for enqueuing AI jobs
- Existing scan logic is identical, just extracted into `handleScanJob`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/scanner && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/scanner/src/worker.ts
git commit -m "feat(scanner): add job routing and auto-enqueue AI suggestions after scan"
```

---

## Task 6: Update Web App Scan Queue Types

**Files:**
- Modify: `apps/web/src/lib/scan-queue.ts`

- [ ] **Step 1: Update the job data type**

Edit `apps/web/src/lib/scan-queue.ts`. The full file should be:

```typescript
import { Queue } from "bullmq";
import { redis } from "./redis";

export interface ScanJobData {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}

export interface AiSuggestionsJobData {
  scanId: string;
}

export const scanQueue = new Queue<ScanJobData | AiSuggestionsJobData>("scan", {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
```

Note: The web app only enqueues `ScanJobData` jobs. `AiSuggestionsJobData` is included in the union for type completeness — the scanner worker enqueues AI jobs itself.

- [ ] **Step 2: Verify web app compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/scan-queue.ts
git commit -m "feat(web): update scan queue types to include AI suggestions job data"
```

---

## Task 7: Update Entry Point Log and Verify Full Compilation

**Files:**
- Modify: `apps/scanner/src/index.ts`

- [ ] **Step 1: Update the log message**

Edit `apps/scanner/src/index.ts` line 15. Change:

```typescript
  console.log("[scanner] Worker listening on 'scan' queue");
```

to:

```typescript
  console.log("[scanner] Worker listening on 'scan' queue (scan + ai-suggestions jobs)");
```

- [ ] **Step 2: Verify scanner service compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/scanner && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Verify web app compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scanner/src/index.ts
git commit -m "feat(scanner): update entry point log to reflect AI job support"
```

---

## Task 8: Update Phases and Final Verification

**Files:**
- Modify: `docs/phases.md`

- [ ] **Step 1: Update Phase 3 status**

Edit `docs/phases.md`. Change:

```
| 3 | AI fix suggestions (Claude Haiku) | Not Started | The differentiator — makes scanner output 10x more useful |
```

to:

```
| 3 | AI fix suggestions (Claude Haiku) | Complete | The differentiator — makes scanner output 10x more useful |
```

- [ ] **Step 2: Final verification — scanner compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/scanner && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Final verification — web app compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 3 AI fix suggestions as complete"
```
