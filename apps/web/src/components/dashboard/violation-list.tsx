"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ViolationSheet } from "@/components/dashboard/violation-sheet";

interface ViolationListProps {
  scanId: string;
}

const impactOptions = ["critical", "serious", "moderate", "minor"] as const;
const statusOptions = ["open", "fixed", "ignored"] as const;

const impactVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  serious: "default",
  moderate: "secondary",
  minor: "outline",
};

export function ViolationList({ scanId }: ViolationListProps) {
  const [impactFilter, setImpactFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>("open");
  const [selectedViolation, setSelectedViolation] = useState<null | {
    id: string;
    ruleId: string;
    impact: string;
    description: string;
    helpUrl: string | null;
    htmlSnippet: string | null;
    selector: string | null;
    aiExplanation: string | null;
    aiFixCode: string | null;
    status: string;
    scanPageId: string;
  }>(null);

  const violationsQuery = trpc.violations.listByScan.useQuery({
    scanId,
    impact: impactFilter as "critical" | "serious" | "moderate" | "minor" | undefined,
    status: statusFilter as "open" | "fixed" | "ignored" | undefined,
  });

  const violations = violationsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Impact:</span>
          <Button
            variant={impactFilter === undefined ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setImpactFilter(undefined)}
          >
            All
          </Button>
          {impactOptions.map((impact) => (
            <Button
              key={impact}
              variant={impactFilter === impact ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                setImpactFilter(impactFilter === impact ? undefined : impact)
              }
            >
              {impact}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          <Button
            variant={statusFilter === undefined ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setStatusFilter(undefined)}
          >
            All
          </Button>
          {statusOptions.map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "secondary" : "ghost"}
              size="sm"
              onClick={() =>
                setStatusFilter(statusFilter === status ? undefined : status)
              }
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {violationsQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading violations...
        </p>
      ) : violations.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No violations found with current filters.
        </p>
      ) : (
        <div className="space-y-2">
          {violations.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedViolation(v)}
              className="flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant={impactVariant[v.impact] ?? "outline"} className="shrink-0">
                    {v.impact}
                  </Badge>
                  <span className="font-medium text-sm truncate">{v.ruleId}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground truncate">
                  {v.description}
                </p>
              </div>
              <div className="ml-2 shrink-0">
                <Badge
                  variant={v.status === "open" ? "outline" : v.status === "fixed" ? "default" : "secondary"}
                >
                  {v.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sheet */}
      <ViolationSheet
        violation={selectedViolation}
        open={selectedViolation !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedViolation(null);
        }}
        onStatusUpdated={() => violationsQuery.refetch()}
      />
    </div>
  );
}
