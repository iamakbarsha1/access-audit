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
