"use client";

import { Badge } from "@/components/ui/badge";

interface Scan {
  id: string;
  status: string;
  pagesScanned: number | null;
  complianceScore: number | null;
  durationMs: number | null;
  createdAt: Date | string;
}

interface ScanHistoryTableProps {
  scans: Scan[];
  onSelectScan?: (scanId: string) => void;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  processing: "secondary",
  queued: "outline",
  failed: "destructive",
};

export function ScanHistoryTable({ scans, onSelectScan }: ScanHistoryTableProps) {
  if (scans.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No scans yet. Run your first scan to see results here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Date</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Pages</th>
            <th className="pb-2 font-medium">Score</th>
            <th className="pb-2 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => (
            <tr
              key={scan.id}
              className={onSelectScan ? "cursor-pointer hover:bg-muted/50" : ""}
              onClick={() => onSelectScan?.(scan.id)}
            >
              <td className="py-2">{formatDate(scan.createdAt)}</td>
              <td className="py-2">
                <Badge variant={statusVariant[scan.status] ?? "outline"}>
                  {scan.status}
                </Badge>
              </td>
              <td className="py-2">{scan.pagesScanned ?? "—"}</td>
              <td className="py-2">
                {scan.complianceScore !== null ? `${scan.complianceScore}%` : "—"}
              </td>
              <td className="py-2">{formatDuration(scan.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
