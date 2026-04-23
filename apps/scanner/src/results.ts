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
