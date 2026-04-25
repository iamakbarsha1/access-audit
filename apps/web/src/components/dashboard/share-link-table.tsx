"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, Trash2, Link, ExternalLink } from "lucide-react";

interface ShareLinkTableProps {
  siteId: string;
  canAccess: boolean;
  scans: Array<{ id: string; createdAt: Date | string; complianceScore: number | null }>;
  orgSlug?: string | null;
  hasWhiteLabel?: boolean;
}

export function ShareLinkTable({ siteId, canAccess, scans, orgSlug, hasWhiteLabel }: ShareLinkTableProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string>("");
  const [expiresIn, setExpiresIn] = useState<"7d" | "30d" | "90d" | "never">("30d");

  const reportsQuery = trpc.reports.listBySite.useQuery({
    siteId,
    type: undefined,
  });

  const createShareLink = trpc.reports.createShareLink.useMutation({
    onSuccess: () => reportsQuery.refetch(),
  });

  const revokeShareLink = trpc.reports.revokeShareLink.useMutation({
    onSuccess: () => reportsQuery.refetch(),
  });

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share Links</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upgrade to Agency or Pro to share scan results with clients.
          </p>
        </CardContent>
      </Card>
    );
  }

  const shareReports =
    reportsQuery.data?.filter(
      (r) => r.type === "share_snapshot" || r.type === "share_live"
    ) ?? [];

  const completedScans = scans.filter((s) => s.complianceScore !== null);

  function handleCopy(token: string) {
    let url: string;
    if (hasWhiteLabel && orgSlug) {
      // Use white-label subdomain URL
      const baseDomain = window.location.hostname.split(".").slice(-2).join(".");
      const protocol = window.location.protocol;
      url = `${protocol}//${orgSlug}.${baseDomain}/r/${token}`;
    } else {
      url = `${window.location.origin}/share/${token}`;
    }
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleCreateSnapshot() {
    if (!selectedScanId) return;
    createShareLink.mutate({
      siteId,
      type: "share_snapshot",
      scanId: selectedScanId,
      expiresIn,
    });
  }

  function handleCreateLive() {
    createShareLink.mutate({
      siteId,
      type: "share_live",
      expiresIn,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Share Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create new share link */}
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-sm font-medium">Expires</label>
              <Select
                value={expiresIn}
                onValueChange={(v) => setExpiresIn(v as typeof expiresIn)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex flex-1 gap-2">
              <Select
                value={selectedScanId}
                onValueChange={setSelectedScanId}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick a scan..." />
                </SelectTrigger>
                <SelectContent>
                  {completedScans.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {new Date(s.createdAt).toLocaleDateString()} —{" "}
                      {s.complianceScore}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleCreateSnapshot}
                disabled={!selectedScanId || createShareLink.isPending}
              >
                <Link className="mr-1 h-4 w-4" />
                Share Scan
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={handleCreateLive}
              disabled={createShareLink.isPending}
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              Share Live Dashboard
            </Button>
          </div>
        </div>

        {/* Active links table */}
        {shareReports.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Created</th>
                  <th className="pb-2 font-medium">Expires</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shareReports.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">
                      {r.type === "share_live" ? "Live" : "Snapshot"}
                    </td>
                    <td className="py-2">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {r.expiresAt
                        ? new Date(r.expiresAt).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="flex gap-1 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          r.shareToken && handleCopy(r.shareToken)
                        }
                      >
                        {copied === r.shareToken ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          revokeShareLink.mutate({ reportId: r.id })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
