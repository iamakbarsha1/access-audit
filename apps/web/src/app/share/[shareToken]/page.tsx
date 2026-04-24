import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import {
  reports,
  scans,
  scanPages,
  violations,
  sites,
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";

interface SharePageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { shareToken } = await params;

  // Fetch report by share token
  const report = await db
    .select()
    .from(reports)
    .where(eq(reports.shareToken, shareToken));

  if (!report[0]) {
    notFound();
  }

  const r = report[0];

  // Check expiration
  if (r.expiresAt && new Date() > r.expiresAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Report Expired</h1>
          <p className="mt-2 text-gray-600">
            This report has expired. Contact your agency for an updated link.
          </p>
        </div>
      </div>
    );
  }

  // Fetch org branding
  const org = await db
    .select()
    .from(organization)
    .where(eq(organization.id, r.organizationId));

  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, r.organizationId));

  const brandColor = settings[0]?.brandColor ?? "#6366f1";
  const logoUrl = org[0]?.logo ?? null;
  const orgName = org[0]?.name ?? "AccessAudit";

  // Fetch site
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, r.siteId));

  if (!site[0]) {
    notFound();
  }

  // Determine which scan to show
  let scanData;
  let pageData;
  let violationData;
  let trendData: Array<{ score: number; date: string }> = [];

  if (r.type === "share_snapshot" && r.scanId) {
    // Snapshot: show specific scan
    const scan = await db
      .select()
      .from(scans)
      .where(eq(scans.id, r.scanId));

    scanData = scan[0] ?? null;
  } else {
    // Live: show latest completed scan + trend
    const recentScans = await db
      .select()
      .from(scans)
      .where(
        and(eq(scans.siteId, r.siteId), eq(scans.status, "completed"))
      )
      .orderBy(desc(scans.createdAt))
      .limit(10);

    scanData = recentScans[0] ?? null;
    trendData = recentScans
      .reverse()
      .map((s) => ({
        score: s.complianceScore ?? 0,
        date: new Date(s.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }));
  }

  if (!scanData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">No Scan Data</h1>
          <p className="mt-2 text-gray-600">No completed scans available yet.</p>
        </div>
      </div>
    );
  }

  // Fetch pages and violations for the scan
  pageData = await db
    .select()
    .from(scanPages)
    .where(eq(scanPages.scanId, scanData.id));

  violationData = await db
    .select()
    .from(violations)
    .where(eq(violations.scanId, scanData.id));

  const violationCounts = (scanData.violationCounts ?? {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  }) as { critical: number; serious: number; moderate: number; minor: number };

  // Build page URL map for violations
  const pageUrlMap: Record<string, string> = {};
  for (const p of pageData) {
    pageUrlMap[p.id] = p.url;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with branding */}
      <header
        className="border-b bg-white px-6 py-4"
        style={{ borderBottomColor: brandColor }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={orgName}
                className="h-8 w-auto object-contain"
              />
            )}
            <span className="text-lg font-semibold text-gray-900">
              {orgName}
            </span>
          </div>
          <span className="text-sm text-gray-500">
            {r.type === "share_live" ? "Live Dashboard" : "Scan Report"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Site + Score */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{site[0].name}</h1>
          <p className="text-gray-500">{site[0].url}</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className="text-5xl font-bold"
              style={{ color: brandColor }}
            >
              {scanData.complianceScore ?? 0}%
            </span>
            <span className="text-gray-500">Compliance Score</span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Scanned on{" "}
            {new Date(scanData.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Trend chart for live view */}
        {r.type === "share_live" && trendData.length > 1 && (
          <div className="mb-8 rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Score Trend
            </h2>
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {trendData.map((point, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-xs font-medium text-gray-700">
                    {point.score}%
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${point.score}%`,
                      backgroundColor: brandColor,
                      minHeight: 4,
                    }}
                  />
                  <span className="text-xs text-gray-400">{point.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Violation Summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              { label: "Critical", count: violationCounts.critical, color: "#dc2626" },
              { label: "Serious", count: violationCounts.serious, color: "#ea580c" },
              { label: "Moderate", count: violationCounts.moderate, color: "#ca8a04" },
              { label: "Minor", count: violationCounts.minor, color: "#16a34a" },
            ] as const
          ).map((item) => (
            <div
              key={item.label}
              className="rounded-lg border bg-white p-4 text-center"
            >
              <p className="text-3xl font-bold" style={{ color: item.color }}>
                {item.count}
              </p>
              <p className="text-sm text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Page-by-Page Breakdown */}
        <div className="mb-8 rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Page-by-Page Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">URL</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((page) => {
                  const counts = (page.violationCounts ?? {
                    critical: 0,
                    serious: 0,
                    moderate: 0,
                    minor: 0,
                  }) as {
                    critical: number;
                    serious: number;
                    moderate: number;
                    minor: number;
                  };
                  return (
                    <tr key={page.id} className="border-b">
                      <td className="py-2 text-gray-700">{page.url}</td>
                      <td className="py-2">
                        {page.complianceScore ?? "—"}%
                      </td>
                      <td className="py-2">
                        {counts.critical + counts.serious + counts.moderate + counts.minor}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Violations List */}
        <div className="mb-8 rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Violations ({violationData.length})
          </h2>
          <div className="space-y-4">
            {violationData.slice(0, 50).map((v) => (
              <div key={v.id} className="border-b pb-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      v.impact === "critical"
                        ? "bg-red-100 text-red-800"
                        : v.impact === "serious"
                          ? "bg-orange-100 text-orange-800"
                          : v.impact === "moderate"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                    }`}
                  >
                    {v.impact}
                  </span>
                  <span className="font-medium text-gray-900">
                    {v.ruleId}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Page: {pageUrlMap[v.scanPageId] ?? "Unknown"}
                </p>
                <p className="mt-1 text-sm text-gray-700">{v.description}</p>
                {v.aiExplanation && (
                  <div className="mt-2 rounded bg-blue-50 p-3 text-sm text-blue-900">
                    <strong>Explanation:</strong> {v.aiExplanation}
                  </div>
                )}
                {v.aiFixCode && (
                  <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
                    {v.aiFixCode}
                  </pre>
                )}
              </div>
            ))}
            {violationData.length > 50 && (
              <p className="text-center text-sm text-gray-400">
                Showing first 50 of {violationData.length} violations.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white px-6 py-4 text-center text-xs text-gray-400">
        Powered by AccessAudit
      </footer>
    </div>
  );
}
