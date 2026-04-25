import { NextResponse } from "next/server";
import { db, eq, and, sql } from "@access-audit/db";
import { sites, scans } from "@access-audit/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scanQueue } = await import("@/lib/scan-queue");

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
        maxPages: 50,
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
