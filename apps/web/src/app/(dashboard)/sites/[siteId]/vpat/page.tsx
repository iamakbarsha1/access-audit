"use client";

import { useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, RotateCcw } from "lucide-react";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import debounce from "lodash.debounce";

const CONFORMANCE_OPTIONS = [
  { value: "supports", label: "Supports" },
  { value: "partially_supports", label: "Partially Supports" },
  { value: "does_not_support", label: "Does Not Support" },
  { value: "not_applicable", label: "Not Applicable" },
  { value: "not_evaluated", label: "Not Evaluated" },
] as const;

export default function VpatReviewPage() {
  const params = useParams<{ siteId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reportId = searchParams.get("reportId") ?? "";
  const [levelFilter, setLevelFilter] = useState<"all" | "A" | "AA">("all");

  const vpatQuery = trpc.reports.getVpatEntries.useQuery(
    { reportId },
    { enabled: !!reportId }
  );

  const updateEntry = trpc.reports.updateVpatEntry.useMutation();
  const updateMetadata = trpc.reports.updateVpatMetadata.useMutation();
  const resetVpat = trpc.reports.resetVpat.useMutation({
    onSuccess: () => vpatQuery.refetch(),
  });

  const criteriaMap = new Map(
    WCAG_21_AA_CRITERIA.map((c) => [c.id, c.name])
  );

  const debouncedUpdateEntry = useCallback(
    debounce(
      (entryId: string, data: { conformanceLevel?: string; remarks?: string }) => {
        updateEntry.mutate({ entryId, ...data });
      },
      500
    ),
    []
  );

  const debouncedUpdateMetadata = useCallback(
    debounce((metadata: Record<string, unknown>) => {
      updateMetadata.mutate({ reportId, metadata });
    }, 500),
    [reportId]
  );

  if (!reportId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/sites/${params.siteId}`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Site
        </Button>
        <p className="text-muted-foreground">No VPAT report selected.</p>
      </div>
    );
  }

  if (vpatQuery.isLoading) {
    return <p className="text-muted-foreground">Loading VPAT data...</p>;
  }

  if (!vpatQuery.data) {
    return <p className="text-muted-foreground">VPAT not found.</p>;
  }

  const { report, entries } = vpatQuery.data;
  const metadata = (report.metadata ?? {}) as Record<string, string>;

  const filteredEntries =
    levelFilter === "all"
      ? entries
      : entries.filter((e) => e.level === levelFilter);

  const reviewedCount = entries.filter(
    (e) => e.conformanceLevel !== "not_evaluated" || !e.autoDetected
  ).length;

  async function handleDownloadVpat() {
    const res = await fetch("/api/reports/generate-vpat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId }),
    });

    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpat-${reportId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/sites/${params.siteId}`)}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Site
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">VPAT Review</h1>
          <p className="text-sm text-muted-foreground">
            {reviewedCount}/{entries.length} criteria reviewed
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => resetVpat.mutate({ reportId })}
            disabled={resetVpat.isPending}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleDownloadVpat}>
            <FileDown className="mr-1 h-4 w-4" />
            Download VPAT PDF
          </Button>
        </div>
      </div>

      {/* Product Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Product Name</label>
            <Input
              defaultValue={metadata.productName ?? ""}
              onChange={(e) =>
                debouncedUpdateMetadata({
                  ...metadata,
                  productName: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">Contact Email</label>
            <Input
              defaultValue={metadata.contactEmail ?? ""}
              onChange={(e) =>
                debouncedUpdateMetadata({
                  ...metadata,
                  contactEmail: e.target.value,
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Product Description</label>
            <Textarea
              defaultValue={metadata.productDescription ?? ""}
              onChange={(e) =>
                debouncedUpdateMetadata({
                  ...metadata,
                  productDescription: e.target.value,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filter by level:</span>
        <Select
          value={levelFilter}
          onValueChange={(v) => setLevelFilter(v as typeof levelFilter)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="A">Level A</SelectItem>
            <SelectItem value="AA">Level AA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Criteria Table */}
      <div className="space-y-2">
        {filteredEntries.map((entry) => (
          <Card
            key={entry.id}
            className={
              entry.conformanceLevel === "not_evaluated"
                ? "border-amber-300 bg-amber-50/50"
                : ""
            }
          >
            <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_200px_1fr]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">
                    {entry.criterionId}
                  </span>
                  <Badge variant="outline">{entry.level}</Badge>
                  {entry.autoDetected && (
                    <Badge variant="secondary" className="text-xs">
                      Auto
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {criteriaMap.get(entry.criterionId) ?? entry.criterionId}
                </p>
              </div>
              <Select
                defaultValue={entry.conformanceLevel}
                onValueChange={(v) =>
                  debouncedUpdateEntry(entry.id, { conformanceLevel: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFORMANCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Remarks..."
                defaultValue={entry.remarks ?? ""}
                className="min-h-[60px]"
                onChange={(e) =>
                  debouncedUpdateEntry(entry.id, { remarks: e.target.value })
                }
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
