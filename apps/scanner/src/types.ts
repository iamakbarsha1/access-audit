export interface ScanJob {
  scanId: string;
  siteId: string;
  url: string;
  maxPages: number;
}

export interface AiSuggestionsJob {
  scanId: string;
}

export interface AiFixResult {
  explanation: string;
  fixes: string[];
}

export interface PageResult {
  url: string;
  status: "scanned" | "failed" | "skipped";
  complianceScore: number | null;
  violationCounts: ViolationCounts | null;
  violations: ViolationResult[];
  errorMessage: string | null;
  durationMs: number;
}

export interface ViolationResult {
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  wcagTags: string[];
  description: string;
  helpUrl: string;
  htmlSnippet: string;
  selector: string;
}

export interface ViolationCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export type ProgressEvent =
  | { event: "crawl_start"; scanId: string }
  | { event: "crawl_complete"; scanId: string; totalPages: number }
  | {
      event: "page_scanned";
      scanId: string;
      pagesScanned: number;
      totalPages: number;
      currentUrl: string;
    }
  | { event: "scan_complete"; scanId: string; complianceScore: number }
  | { event: "scan_failed"; scanId: string; error: string }
  | { event: "ai_start"; scanId: string; totalGroups: number }
  | {
      event: "ai_progress";
      scanId: string;
      groupsProcessed: number;
      totalGroups: number;
      currentRule: string;
    }
  | { event: "ai_complete"; scanId: string }
  | { event: "ai_failed"; scanId: string; error: string };
