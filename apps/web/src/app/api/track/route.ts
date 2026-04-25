import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db, sql } from "@access-audit/db";
import { pageViews } from "@access-audit/db/schema";

function hashVisitor(ip: string): string {
  const today = new Date().toISOString().split("T")[0];
  const salt = `${process.env.CRON_SECRET ?? "dev-salt"}-${today}`;
  return createHash("sha256").update(`${ip}-${salt}`).digest("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const path = typeof body.path === "string" ? body.path : "/";
    const referrer = typeof body.referrer === "string" ? body.referrer : null;

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
    const visitorHash = hashVisitor(ip);
    const userAgent = request.headers.get("user-agent") ?? null;

    // Deduplicate: skip if same visitor+path within last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await db
      .select({ id: pageViews.id })
      .from(pageViews)
      .where(
        sql`${pageViews.visitorHash} = ${visitorHash} AND ${pageViews.path} = ${path} AND ${pageViews.createdAt} > ${oneHourAgo}`
      )
      .limit(1);

    if (existing.length > 0) {
      return new NextResponse(null, { status: 204 });
    }

    await db.insert(pageViews).values({
      path,
      visitorHash,
      referrer,
      userAgent,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Fail silently — analytics should never break the user experience
    return new NextResponse(null, { status: 204 });
  }
}
