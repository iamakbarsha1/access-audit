import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@access-audit/db/client";
import { reports, vpatEntries } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import { VpatReport, type VpatReportData } from "@/lib/pdf/vpat-report";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const reportId = body.reportId as string;

  if (!reportId) {
    return NextResponse.json({ error: "reportId required" }, { status: 400 });
  }

  // Fetch report
  const report = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!report[0] || report[0].type !== "vpat") {
    return NextResponse.json({ error: "VPAT not found" }, { status: 404 });
  }

  // Fetch entries
  const entries = await db
    .select()
    .from(vpatEntries)
    .where(eq(vpatEntries.reportId, reportId));

  // Build criteria name lookup
  const criteriaMap = new Map(
    WCAG_21_AA_CRITERIA.map((c) => [c.id, c.name])
  );

  const metadata = (report[0].metadata ?? {}) as Record<string, string>;

  const reportData: VpatReportData = {
    productName: metadata.productName ?? "",
    reportDate: metadata.reportDate
      ? new Date(metadata.reportDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
    productDescription: metadata.productDescription ?? "",
    contactEmail: metadata.contactEmail ?? "",
    evaluationMethods: metadata.evaluationMethods ?? "Automated testing with axe-core",
    entries: entries.map((e) => ({
      criterionId: e.criterionId,
      criterionName: criteriaMap.get(e.criterionId) ?? e.criterionId,
      level: e.level as "A" | "AA",
      conformanceLevel: e.conformanceLevel,
      remarks: e.remarks,
    })),
  };

  const buffer = await renderToBuffer(
    <VpatReport data={reportData} />
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vpat-${report[0].id.slice(0, 8)}.pdf"`,
    },
  });
}
