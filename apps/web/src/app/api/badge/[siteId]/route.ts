import { NextRequest, NextResponse } from "next/server";
import { db } from "@access-audit/db/client";
import { sites, scans, organizationSettings } from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import { canUseBadge } from "@access-audit/db";

function generateBadgeSvg(score: number | null): string {
  const label = "WCAG 2.1 AA";
  const value = score !== null ? `${score}% Compliant` : "Not Available";

  let valueColor: string;
  if (score === null) {
    valueColor = "#9ca3af"; // gray
  } else if (score >= 90) {
    valueColor = "#22c55e"; // green
  } else if (score >= 70) {
    valueColor = "#eab308"; // yellow
  } else {
    valueColor = "#ef4444"; // red
  }

  const labelWidth = 90;
  const valueWidth = score !== null ? 110 : 100;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${valueColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#fff">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#fff">${value}</text>
  </g>
</svg>`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  // Fetch site
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, siteId));

  if (!site[0]) {
    return new NextResponse(generateBadgeSvg(null), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Check plan allows badges
  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, site[0].organizationId));

  const plan = settings[0]?.plan ?? "trial";
  if (!canUseBadge(plan)) {
    return new NextResponse(generateBadgeSvg(null), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Get latest completed scan
  const latestScan = await db
    .select()
    .from(scans)
    .where(
      and(eq(scans.siteId, siteId), eq(scans.status, "completed"))
    )
    .orderBy(desc(scans.createdAt))
    .limit(1);

  const score = latestScan[0]?.complianceScore ?? null;

  return new NextResponse(generateBadgeSvg(score), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
