"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

interface ScanButtonProps {
  siteId: string;
  size?: "default" | "sm" | "lg" | "icon";
  onScanComplete?: () => void;
}

export function ScanButton({ siteId, size = "sm", onScanComplete }: ScanButtonProps) {
  const utils = trpc.useUtils();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("Queued...");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startScan = trpc.scans.startScan.useMutation({
    onSuccess: (scan) => {
      setActiveScanId(scan.id);
      setProgress("Queued...");
      toast.success("Scan started");
    },
    onError: (err) => toast.error(err.message),
  });

  const pollProgress = useCallback(async () => {
    if (!activeScanId) return;
    try {
      const data = await utils.client.scans.getProgress.query({ scanId: activeScanId });
      if (data.status === "processing") {
        const scanned = data.pagesScanned ?? 0;
        const found = data.pagesFound ?? 0;
        setProgress(`Scanning ${scanned}/${found} pages...`);
      } else if (data.status === "completed") {
        setActiveScanId(null);
        setProgress("");
        toast.success(`Scan complete — score: ${data.complianceScore ?? "N/A"}%`);
        utils.scans.listBySite.invalidate();
        utils.sites.list.invalidate();
        utils.dashboard.stats.invalidate();
        onScanComplete?.();
      } else if (data.status === "failed") {
        setActiveScanId(null);
        setProgress("");
        toast.error(`Scan failed: ${data.errorMessage ?? "Unknown error"}`);
      }
    } catch {
      // Silently ignore poll errors
    }
  }, [activeScanId, utils, onScanComplete]);

  useEffect(() => {
    if (activeScanId) {
      intervalRef.current = setInterval(pollProgress, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [activeScanId, pollProgress]);

  const isScanning = startScan.isPending || activeScanId !== null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size={size}
        variant="outline"
        onClick={() => startScan.mutate({ siteId })}
        disabled={isScanning}
      >
        {isScanning ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            {progress}
          </>
        ) : (
          <>
            <Play className="mr-1 h-4 w-4" />
            Scan
          </>
        )}
      </Button>
    </div>
  );
}
