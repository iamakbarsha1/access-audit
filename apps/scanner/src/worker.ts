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
