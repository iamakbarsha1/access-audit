"use client";

import { Badge } from "@/components/ui/badge";
import { ScanButton } from "@/components/dashboard/scan-button";
import { ExternalLink } from "lucide-react";

interface SiteHeaderProps {
  siteId: string;
  name: string;
  url: string;
  complianceScore: number | null;
  onScanComplete?: () => void;
}

export function SiteHeader({
  siteId,
  name,
  url,
  complianceScore,
  onScanComplete,
}: SiteHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="text-2xl font-bold">{name}</h2>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {url}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-3">
        {complianceScore !== null ? (
          <Badge
            variant={
              complianceScore >= 80
                ? "default"
                : complianceScore >= 50
                  ? "secondary"
                  : "destructive"
            }
            className="text-lg px-3 py-1"
          >
            {complianceScore}%
          </Badge>
        ) : (
          <Badge variant="outline" className="text-lg px-3 py-1">
            Not scanned
          </Badge>
        )}
        <ScanButton siteId={siteId} onScanComplete={onScanComplete} />
      </div>
    </div>
  );
}
