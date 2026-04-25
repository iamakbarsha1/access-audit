import { describe, it, expect } from "vitest";
import type {
  ScanJob,
  AiSuggestionsJob,
  AiFixResult,
  PageResult,
  ViolationResult,
  ViolationCounts,
  ProgressEvent,
} from "../types.js";

/**
 * Compile-time type validation tests.
 * These tests verify that the type interfaces are correctly defined
 * and that values conforming to the interfaces are accepted by TypeScript.
 * The runtime assertions confirm structural correctness.
 */

describe("ScanJob", () => {
  it("accepts a valid ScanJob object", () => {
    const job: ScanJob = {
      scanId: "scan-123",
      siteId: "site-456",
      url: "https://example.com",
      maxPages: 50,
    };

    expect(job.scanId).toBe("scan-123");
    expect(job.siteId).toBe("site-456");
    expect(job.url).toBe("https://example.com");
    expect(job.maxPages).toBe(50);
  });

  it("has all required fields", () => {
    const job: ScanJob = {
      scanId: "",
      siteId: "",
      url: "",
      maxPages: 0,
    };

    expect(Object.keys(job)).toEqual(
      expect.arrayContaining(["scanId", "siteId", "url", "maxPages"])
    );
  });
});

describe("AiSuggestionsJob", () => {
  it("accepts a valid AiSuggestionsJob object", () => {
    const job: AiSuggestionsJob = {
      scanId: "scan-789",
    };

    expect(job.scanId).toBe("scan-789");
  });
});

describe("AiFixResult", () => {
  it("accepts a valid AiFixResult with explanation and fixes", () => {
    const result: AiFixResult = {
      explanation: "Images need alt text for screen readers.",
      fixes: ['<img src="photo.jpg" alt="A photo">'],
    };

    expect(result.explanation).toBeTypeOf("string");
    expect(Array.isArray(result.fixes)).toBe(true);
    expect(result.fixes.every((f) => typeof f === "string")).toBe(true);
  });

  it("accepts an empty fixes array", () => {
    const result: AiFixResult = {
      explanation: "No fixes needed.",
      fixes: [],
    };

    expect(result.fixes).toHaveLength(0);
  });

  it("accepts multiple fixes", () => {
    const result: AiFixResult = {
      explanation: "Multiple elements need fixing.",
      fixes: ["<img alt='a'>", "<img alt='b'>", "<img alt='c'>"],
    };

    expect(result.fixes).toHaveLength(3);
  });
});

describe("ViolationResult", () => {
  it("accepts a valid ViolationResult object", () => {
    const violation: ViolationResult = {
      ruleId: "image-alt",
      impact: "critical",
      wcagTags: ["wcag2a", "wcag111"],
      description: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.6/image-alt",
      htmlSnippet: '<img src="photo.jpg">',
      selector: "img.hero",
    };

    expect(violation.ruleId).toBe("image-alt");
    expect(violation.impact).toBe("critical");
    expect(violation.wcagTags).toContain("wcag2a");
  });

  it("accepts all valid impact levels", () => {
    const impacts: ViolationResult["impact"][] = [
      "critical",
      "serious",
      "moderate",
      "minor",
    ];

    for (const impact of impacts) {
      const violation: ViolationResult = {
        ruleId: "test-rule",
        impact,
        wcagTags: [],
        description: "Test",
        helpUrl: "https://example.com",
        htmlSnippet: "<div>",
        selector: "div",
      };

      expect(violation.impact).toBe(impact);
    }
  });
});

describe("ViolationCounts", () => {
  it("accepts a valid ViolationCounts object", () => {
    const counts: ViolationCounts = {
      critical: 5,
      serious: 3,
      moderate: 10,
      minor: 2,
    };

    expect(counts.critical).toBe(5);
    expect(counts.serious).toBe(3);
    expect(counts.moderate).toBe(10);
    expect(counts.minor).toBe(2);
  });

  it("accepts zero counts", () => {
    const counts: ViolationCounts = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };

    const total = counts.critical + counts.serious + counts.moderate + counts.minor;
    expect(total).toBe(0);
  });
});

describe("PageResult", () => {
  it("accepts a successful page result", () => {
    const result: PageResult = {
      url: "https://example.com/about",
      status: "scanned",
      complianceScore: 85.5,
      violationCounts: { critical: 1, serious: 2, moderate: 3, minor: 4 },
      violations: [
        {
          ruleId: "color-contrast",
          impact: "serious",
          wcagTags: ["wcag2aa"],
          description: "Elements must have sufficient color contrast",
          helpUrl: "https://example.com/help",
          htmlSnippet: '<p style="color: #ccc">',
          selector: "p.light-text",
        },
      ],
      errorMessage: null,
      durationMs: 1500,
    };

    expect(result.status).toBe("scanned");
    expect(result.complianceScore).toBe(85.5);
    expect(result.violations).toHaveLength(1);
    expect(result.errorMessage).toBeNull();
  });

  it("accepts a failed page result", () => {
    const result: PageResult = {
      url: "https://example.com/broken",
      status: "failed",
      complianceScore: null,
      violationCounts: null,
      violations: [],
      errorMessage: "Page timed out after 30000ms",
      durationMs: 30000,
    };

    expect(result.status).toBe("failed");
    expect(result.complianceScore).toBeNull();
    expect(result.violationCounts).toBeNull();
    expect(result.errorMessage).toBe("Page timed out after 30000ms");
  });

  it("accepts a skipped page result", () => {
    const result: PageResult = {
      url: "https://example.com/skipped",
      status: "skipped",
      complianceScore: null,
      violationCounts: null,
      violations: [],
      errorMessage: "Non-HTML content type",
      durationMs: 100,
    };

    expect(result.status).toBe("skipped");
  });
});

describe("ProgressEvent", () => {
  it("accepts crawl_start event", () => {
    const event: ProgressEvent = {
      event: "crawl_start",
      scanId: "scan-1",
    };

    expect(event.event).toBe("crawl_start");
  });

  it("accepts crawl_complete event with totalPages", () => {
    const event: ProgressEvent = {
      event: "crawl_complete",
      scanId: "scan-1",
      totalPages: 25,
    };

    expect(event.event).toBe("crawl_complete");
    expect(event.totalPages).toBe(25);
  });

  it("accepts page_scanned event with progress data", () => {
    const event: ProgressEvent = {
      event: "page_scanned",
      scanId: "scan-1",
      pagesScanned: 5,
      totalPages: 25,
      currentUrl: "https://example.com/page-5",
    };

    expect(event.event).toBe("page_scanned");
    expect(event.pagesScanned).toBe(5);
  });

  it("accepts scan_complete event with compliance score", () => {
    const event: ProgressEvent = {
      event: "scan_complete",
      scanId: "scan-1",
      complianceScore: 92.3,
    };

    expect(event.event).toBe("scan_complete");
    expect(event.complianceScore).toBe(92.3);
  });

  it("accepts scan_failed event with error message", () => {
    const event: ProgressEvent = {
      event: "scan_failed",
      scanId: "scan-1",
      error: "Browser crashed unexpectedly",
    };

    expect(event.event).toBe("scan_failed");
    expect(event.error).toBe("Browser crashed unexpectedly");
  });

  it("accepts ai_start event", () => {
    const event: ProgressEvent = {
      event: "ai_start",
      scanId: "scan-1",
      totalGroups: 10,
    };

    expect(event.event).toBe("ai_start");
    expect(event.totalGroups).toBe(10);
  });

  it("accepts ai_progress event", () => {
    const event: ProgressEvent = {
      event: "ai_progress",
      scanId: "scan-1",
      groupsProcessed: 3,
      totalGroups: 10,
      currentRule: "image-alt",
    };

    expect(event.event).toBe("ai_progress");
    expect(event.groupsProcessed).toBe(3);
    expect(event.currentRule).toBe("image-alt");
  });

  it("accepts ai_complete event", () => {
    const event: ProgressEvent = {
      event: "ai_complete",
      scanId: "scan-1",
    };

    expect(event.event).toBe("ai_complete");
  });

  it("accepts ai_failed event", () => {
    const event: ProgressEvent = {
      event: "ai_failed",
      scanId: "scan-1",
      error: "API rate limit exceeded",
    };

    expect(event.event).toBe("ai_failed");
    expect(event.error).toBe("API rate limit exceeded");
  });

  it("discriminated union narrows types correctly at runtime", () => {
    const events: ProgressEvent[] = [
      { event: "crawl_start", scanId: "s1" },
      { event: "crawl_complete", scanId: "s1", totalPages: 10 },
      { event: "scan_complete", scanId: "s1", complianceScore: 90 },
    ];

    for (const evt of events) {
      switch (evt.event) {
        case "crawl_start":
          expect(evt.scanId).toBeDefined();
          break;
        case "crawl_complete":
          expect(evt.totalPages).toBe(10);
          break;
        case "scan_complete":
          expect(evt.complianceScore).toBe(90);
          break;
      }
    }
  });
});
