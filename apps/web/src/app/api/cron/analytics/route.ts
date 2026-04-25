import { NextResponse } from "next/server";
import { db, sql, eq, and } from "@access-audit/db";
import { pageViews, pageViewsDaily } from "@access-audit/db/schema";
import { sendAnalyticsDigest } from "@/lib/analytics-email";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ANALYTICS_ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json(
      { error: "ANALYTICS_ADMIN_EMAIL not configured" },
      { status: 500 }
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]!;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split("T")[0]!;
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // --- Step 1: Aggregate yesterday's raw data into page_views_daily ---

  const yesterdayStats = await db
    .select({
      path: pageViews.path,
      views: sql<number>`count(*)::int`,
      uniqueVisitors: sql<number>`count(distinct ${pageViews.visitorHash})::int`,
    })
    .from(pageViews)
    .where(
      and(
        sql`${pageViews.createdAt} >= ${yesterday}`,
        sql`${pageViews.createdAt} < ${now}`
      )
    )
    .groupBy(pageViews.path);

  for (const stat of yesterdayStats) {
    // Get top referrer for this path
    const topRef = await db
      .select({
        referrer: pageViews.referrer,
        count: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(
        and(
          sql`${pageViews.createdAt} >= ${yesterday}`,
          sql`${pageViews.createdAt} < ${now}`,
          eq(pageViews.path, stat.path),
          sql`${pageViews.referrer} IS NOT NULL AND ${pageViews.referrer} != ''`
        )
      )
      .groupBy(pageViews.referrer)
      .orderBy(sql`count(*) desc`)
      .limit(1);

    // Upsert into page_views_daily
    await db
      .insert(pageViewsDaily)
      .values({
        path: stat.path,
        date: yesterdayStr,
        views: stat.views,
        uniqueVisitors: stat.uniqueVisitors,
        topReferrer: topRef[0]?.referrer ?? null,
      })
      .onConflictDoUpdate({
        target: [pageViewsDaily.path, pageViewsDaily.date],
        set: {
          views: stat.views,
          uniqueVisitors: stat.uniqueVisitors,
          topReferrer: topRef[0]?.referrer ?? null,
        },
      });
  }

  // --- Step 2: Gather data for email ---

  const totalViews = yesterdayStats.reduce((sum, s) => sum + s.views, 0);
  const totalUnique = yesterdayStats.reduce(
    (sum, s) => sum + s.uniqueVisitors,
    0
  );

  const topPages = [...yesterdayStats]
    .sort((a, b) => b.views - a.views)
    .slice(0, 5)
    .map((s) => ({ path: s.path, views: s.views }));

  // Top referrers across all pages
  const topReferrersRaw = await db
    .select({
      referrer: pageViews.referrer,
      count: sql<number>`count(*)::int`,
    })
    .from(pageViews)
    .where(
      and(
        sql`${pageViews.createdAt} >= ${yesterday}`,
        sql`${pageViews.createdAt} < ${now}`,
        sql`${pageViews.referrer} IS NOT NULL AND ${pageViews.referrer} != ''`
      )
    )
    .groupBy(pageViews.referrer)
    .orderBy(sql`count(*) desc`)
    .limit(3);

  const topReferrers = topReferrersRaw.map((r) => ({
    referrer: r.referrer ?? "Direct",
    count: r.count,
  }));

  // Previous day totals (from page_views_daily)
  const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0]!;
  const prevDayAgg = await db
    .select({
      totalViews: sql<number>`coalesce(sum(${pageViewsDaily.views}), 0)::int`,
      totalUnique: sql<number>`coalesce(sum(${pageViewsDaily.uniqueVisitors}), 0)::int`,
    })
    .from(pageViewsDaily)
    .where(eq(pageViewsDaily.date, twoDaysAgoStr));

  const previousDayViews = prevDayAgg[0]?.totalViews ?? 0;
  const previousDayUnique = prevDayAgg[0]?.totalUnique ?? 0;

  // --- Step 3: Send digest email ---

  await sendAnalyticsDigest(adminEmail, {
    date: yesterdayStr,
    totalViews: totalViews,
    uniqueVisitors: totalUnique,
    topPages,
    topReferrers,
    previousDayViews,
    previousDayUnique,
  });

  // --- Step 4: Purge raw data older than 90 days ---

  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  await db
    .delete(pageViews)
    .where(sql`${pageViews.createdAt} < ${ninetyDaysAgo}`);

  return NextResponse.json({
    success: true,
    date: yesterdayStr,
    totalViews,
    uniqueVisitors: totalUnique,
    topPages: topPages.length,
    emailSent: true,
    purgedOlderThan: ninetyDaysAgo.toISOString(),
  });
}
