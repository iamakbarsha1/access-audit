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
