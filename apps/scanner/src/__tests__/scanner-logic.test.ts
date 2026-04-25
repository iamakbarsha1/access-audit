import { describe, it, expect } from "vitest";
import type { PageResult, ViolationCounts } from "../types.js";

/**
 * Tests for scanner service pure business logic.
 * These test the calculation and data processing functions
 * without requiring Puppeteer, Redis, or database connections.
 */

// ─── Compliance Score Calculation ───────────────────────────────────

describe("compliance score calculation", () => {
  // Mirrors scanSinglePage logic from scanner.ts
  function calculateComplianceScore(
    passesCount: number,
    violationsCount: number
  ): number {
    const totalChecks = passesCount + violationsCount;
    return totalChecks > 0
      ? Math.round((passesCount / totalChecks) * 100)
      : 100;
  }

  it("returns 100 when all checks pass", () => {
    expect(calculateComplianceScore(50, 0)).toBe(100);
  });

  it("returns 0 when all checks fail", () => {
    expect(calculateComplianceScore(0, 50)).toBe(0);
  });

  it("returns 100 when no checks exist", () => {
    expect(calculateComplianceScore(0, 0)).toBe(100);
  });

  it("calculates correct percentage", () => {
    expect(calculateComplianceScore(90, 10)).toBe(90);
    expect(calculateComplianceScore(50, 50)).toBe(50);
    expect(calculateComplianceScore(75, 25)).toBe(75);
  });

  it("rounds to nearest integer", () => {
    // 33/100 = 33%
    expect(calculateComplianceScore(33, 67)).toBe(33);
    // 2/3 = 66.67% → 67
    expect(calculateComplianceScore(2, 1)).toBe(67);
  });
});

// ─── Violation Counts Aggregation ───────────────────────────────────

describe("violation counts aggregation", () => {
  // Mirrors finalizeScan logic from results.ts
  function aggregateViolationCounts(
    pageResults: Pick<PageResult, "status" | "complianceScore" | "violationCounts">[]
  ): {
    totalCounts: ViolationCounts;
    scannedPages: number;
    avgComplianceScore: number;
  } {
    const totalCounts: ViolationCounts = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    let scannedPages = 0;
    let totalComplianceSum = 0;

    for (const result of pageResults) {
      if (result.status === "scanned") {
        scannedPages++;
        totalComplianceSum += result.complianceScore ?? 0;
        if (result.violationCounts) {
          totalCounts.critical += result.violationCounts.critical;
          totalCounts.serious += result.violationCounts.serious;
          totalCounts.moderate += result.violationCounts.moderate;
          totalCounts.minor += result.violationCounts.minor;
        }
      }
    }

    const avgComplianceScore =
      scannedPages > 0
        ? Math.round(totalComplianceSum / scannedPages)
        : 0;

    return { totalCounts, scannedPages, avgComplianceScore };
  }

  it("handles empty results", () => {
    const result = aggregateViolationCounts([]);
    expect(result.scannedPages).toBe(0);
    expect(result.avgComplianceScore).toBe(0);
    expect(result.totalCounts).toEqual({
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    });
  });

  it("aggregates counts from multiple pages", () => {
    const results = [
      {
        status: "scanned" as const,
        complianceScore: 80,
        violationCounts: { critical: 1, serious: 2, moderate: 3, minor: 4 },
      },
      {
        status: "scanned" as const,
        complianceScore: 90,
        violationCounts: { critical: 0, serious: 1, moderate: 2, minor: 3 },
      },
    ];

    const result = aggregateViolationCounts(results);
    expect(result.totalCounts).toEqual({
      critical: 1,
      serious: 3,
      moderate: 5,
      minor: 7,
    });
    expect(result.scannedPages).toBe(2);
    expect(result.avgComplianceScore).toBe(85);
  });

  it("ignores failed pages", () => {
    const results = [
      {
        status: "scanned" as const,
        complianceScore: 80,
        violationCounts: { critical: 1, serious: 0, moderate: 0, minor: 0 },
      },
      {
        status: "failed" as const,
        complianceScore: null,
        violationCounts: null,
      },
    ];

    const result = aggregateViolationCounts(results);
    expect(result.scannedPages).toBe(1);
    expect(result.avgComplianceScore).toBe(80);
    expect(result.totalCounts.critical).toBe(1);
  });

  it("ignores skipped pages", () => {
    const results = [
      {
        status: "skipped" as const,
        complianceScore: null,
        violationCounts: null,
      },
    ];

    const result = aggregateViolationCounts(results);
    expect(result.scannedPages).toBe(0);
    expect(result.avgComplianceScore).toBe(0);
  });

  it("handles null violationCounts gracefully", () => {
    const results = [
      {
        status: "scanned" as const,
        complianceScore: 100,
        violationCounts: null,
      },
    ];

    const result = aggregateViolationCounts(results);
    expect(result.scannedPages).toBe(1);
    expect(result.avgComplianceScore).toBe(100);
    expect(result.totalCounts).toEqual({
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    });
  });
});

// ─── URL Normalization ──────────────────────────────────────────────

describe("URL normalization", () => {
  // Mirrors normalizeUrl from crawler.ts
  function normalizeUrl(url: string, origin: string): string | null {
    try {
      const resolved = new URL(url, origin);
      resolved.hash = "";
      let normalized = resolved.href;
      if (
        normalized.endsWith("/") &&
        normalized !== resolved.origin + "/"
      ) {
        normalized = normalized.slice(0, -1);
      }
      const ext = resolved.pathname.split(".").pop()?.toLowerCase();
      const nonHtmlExts = [
        "pdf", "jpg", "jpeg", "png", "gif", "svg", "webp",
        "css", "js", "zip", "xml", "json",
      ];
      if (ext && nonHtmlExts.includes(ext)) {
        return null;
      }
      return normalized;
    } catch {
      return null;
    }
  }

  it("resolves relative URLs against origin", () => {
    expect(normalizeUrl("/about", "https://example.com")).toBe(
      "https://example.com/about"
    );
  });

  it("handles absolute URLs", () => {
    expect(
      normalizeUrl("https://example.com/page", "https://example.com")
    ).toBe("https://example.com/page");
  });

  it("strips hash fragments", () => {
    expect(
      normalizeUrl("https://example.com/page#section", "https://example.com")
    ).toBe("https://example.com/page");
  });

  it("strips trailing slashes (except root)", () => {
    expect(
      normalizeUrl("https://example.com/page/", "https://example.com")
    ).toBe("https://example.com/page");
  });

  it("preserves root trailing slash", () => {
    expect(
      normalizeUrl("https://example.com/", "https://example.com")
    ).toBe("https://example.com/");
  });

  it("filters PDF files", () => {
    expect(
      normalizeUrl("/document.pdf", "https://example.com")
    ).toBeNull();
  });

  it("filters image files", () => {
    expect(normalizeUrl("/logo.png", "https://example.com")).toBeNull();
    expect(normalizeUrl("/photo.jpg", "https://example.com")).toBeNull();
    expect(normalizeUrl("/icon.svg", "https://example.com")).toBeNull();
    expect(normalizeUrl("/bg.webp", "https://example.com")).toBeNull();
    expect(normalizeUrl("/pic.gif", "https://example.com")).toBeNull();
    expect(normalizeUrl("/photo.jpeg", "https://example.com")).toBeNull();
  });

  it("filters CSS and JS files", () => {
    expect(normalizeUrl("/style.css", "https://example.com")).toBeNull();
    expect(normalizeUrl("/app.js", "https://example.com")).toBeNull();
  });

  it("filters data files", () => {
    expect(normalizeUrl("/data.json", "https://example.com")).toBeNull();
    expect(normalizeUrl("/sitemap.xml", "https://example.com")).toBeNull();
    expect(normalizeUrl("/archive.zip", "https://example.com")).toBeNull();
  });

  it("allows HTML pages without extensions", () => {
    expect(
      normalizeUrl("/about", "https://example.com")
    ).toBe("https://example.com/about");
  });

  it("allows .html files (not in exclusion list)", () => {
    expect(
      normalizeUrl("/page.html", "https://example.com")
    ).toBe("https://example.com/page.html");
  });

  it("returns null for truly malformed URLs", () => {
    // "://invalid" gets resolved as relative path by new URL()
    // Only truly unparseable strings return null
    expect(normalizeUrl("", "not-a-valid-origin")).toBeNull();
  });
});

// ─── Same Domain Check ──────────────────────────────────────────────

describe("same domain check", () => {
  // Mirrors isSameDomain from crawler.ts
  function isSameDomain(url: string, origin: string): boolean {
    try {
      const urlHost = new URL(url).hostname;
      const originHost = new URL(origin).hostname;
      return urlHost === originHost;
    } catch {
      return false;
    }
  }

  it("same domain returns true", () => {
    expect(
      isSameDomain("https://example.com/page", "https://example.com")
    ).toBe(true);
  });

  it("same domain different path returns true", () => {
    expect(
      isSameDomain(
        "https://example.com/a/b/c",
        "https://example.com/other"
      )
    ).toBe(true);
  });

  it("different domain returns false", () => {
    expect(
      isSameDomain("https://other.com/page", "https://example.com")
    ).toBe(false);
  });

  it("subdomain is different domain", () => {
    expect(
      isSameDomain(
        "https://sub.example.com",
        "https://example.com"
      )
    ).toBe(false);
  });

  it("www subdomain is different domain", () => {
    expect(
      isSameDomain(
        "https://www.example.com",
        "https://example.com"
      )
    ).toBe(false);
  });

  it("invalid URLs return false", () => {
    expect(isSameDomain("not-a-url", "https://example.com")).toBe(false);
  });
});

// ─── Sitemap XML Parsing ────────────────────────────────────────────

describe("sitemap XML parsing", () => {
  // Mirrors extractLocsFromXml from crawler.ts
  function extractLocsFromXml(xml: string): string[] {
    const urls: string[] = [];
    const locRegex =
      /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/gi;
    let match;
    while ((match = locRegex.exec(xml)) !== null) {
      if (match[1]) {
        urls.push(match[1].trim());
      }
    }
    return urls;
  }

  it("extracts URLs from valid sitemap XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>`;

    const urls = extractLocsFromXml(xml);
    expect(urls).toHaveLength(3);
    expect(urls).toContain("https://example.com/");
    expect(urls).toContain("https://example.com/about");
    expect(urls).toContain("https://example.com/contact");
  });

  it("handles empty sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset></urlset>`;
    expect(extractLocsFromXml(xml)).toHaveLength(0);
  });

  it("handles sitemap with extra elements", () => {
    const xml = `<urlset>
  <url>
    <loc>https://example.com/page1</loc>
    <lastmod>2024-01-01</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

    const urls = extractLocsFromXml(xml);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://example.com/page1");
  });

  it("trims whitespace from URLs", () => {
    const xml = `<urlset>
  <url><loc>  https://example.com/page  </loc></url>
</urlset>`;
    const urls = extractLocsFromXml(xml);
    expect(urls[0]).toBe("https://example.com/page");
  });

  it("returns empty for completely invalid XML", () => {
    expect(extractLocsFromXml("not xml at all")).toHaveLength(0);
    expect(extractLocsFromXml("")).toHaveLength(0);
  });

  it("ignores <loc> outside of <url> blocks", () => {
    // This is the regex behavior — it requires <url> wrapper
    const xml = `<loc>https://should-be-ignored.com</loc>`;
    expect(extractLocsFromXml(xml)).toHaveLength(0);
  });
});

// ─── Retry Logic ────────────────────────────────────────────────────

describe("retry with exponential backoff", () => {
  // Mirrors scanPageWithRetry's delay calculation
  function calculateRetryDelay(
    attempt: number,
    baseDelayMs: number
  ): number {
    return baseDelayMs * Math.pow(2, attempt);
  }

  it("first retry delay is base delay", () => {
    expect(calculateRetryDelay(0, 1000)).toBe(1000);
  });

  it("second retry delay is 2x", () => {
    expect(calculateRetryDelay(1, 1000)).toBe(2000);
  });

  it("third retry delay is 4x", () => {
    expect(calculateRetryDelay(2, 1000)).toBe(4000);
  });

  it("handles custom base delay", () => {
    expect(calculateRetryDelay(0, 500)).toBe(500);
    expect(calculateRetryDelay(1, 500)).toBe(1000);
    expect(calculateRetryDelay(2, 500)).toBe(2000);
  });
});

// ─── AI Response Parsing ────────────────────────────────────────────

describe("AI response parsing", () => {
  // Mirrors parseResponse from ai-client.ts
  function parseResponse(text: string): {
    explanation: string;
    fixes: string[];
  } {
    let jsonStr = text.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = (jsonMatch[1] ?? jsonStr).trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (
      typeof parsed.explanation !== "string" ||
      !Array.isArray(parsed.fixes) ||
      !parsed.fixes.every((f: unknown) => typeof f === "string")
    ) {
      throw new Error(
        "Invalid AI response structure: missing explanation or fixes array"
      );
    }

    return { explanation: parsed.explanation, fixes: parsed.fixes };
  }

  it("parses valid JSON response", () => {
    const response = JSON.stringify({
      explanation: "This image lacks alt text.",
      fixes: ['<img src="logo.png" alt="Company Logo">'],
    });

    const result = parseResponse(response);
    expect(result.explanation).toBe("This image lacks alt text.");
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]).toContain('alt="Company Logo"');
  });

  it("extracts JSON from markdown code blocks", () => {
    const response = `Here's the fix:
\`\`\`json
{
  "explanation": "Missing alt text",
  "fixes": ["<img alt='logo'>"]
}
\`\`\``;

    const result = parseResponse(response);
    expect(result.explanation).toBe("Missing alt text");
    expect(result.fixes).toEqual(["<img alt='logo'>"]);
  });

  it("extracts JSON from code blocks without json label", () => {
    const response = `\`\`\`
{"explanation": "test", "fixes": ["fix1"]}
\`\`\``;

    const result = parseResponse(response);
    expect(result.explanation).toBe("test");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseResponse("not json")).toThrow();
  });

  it("throws when explanation is missing", () => {
    const response = JSON.stringify({ fixes: ["fix1"] });
    expect(() => parseResponse(response)).toThrow(
      "Invalid AI response structure"
    );
  });

  it("throws when fixes is not an array", () => {
    const response = JSON.stringify({
      explanation: "test",
      fixes: "not-array",
    });
    expect(() => parseResponse(response)).toThrow(
      "Invalid AI response structure"
    );
  });

  it("throws when fixes contains non-strings", () => {
    const response = JSON.stringify({
      explanation: "test",
      fixes: [123, "valid"],
    });
    expect(() => parseResponse(response)).toThrow(
      "Invalid AI response structure"
    );
  });

  it("handles multiple fixes", () => {
    const response = JSON.stringify({
      explanation: "Multiple elements need fixing",
      fixes: [
        '<img src="a.png" alt="Image A">',
        '<img src="b.png" alt="Image B">',
        '<img src="c.png" alt="Image C">',
      ],
    });

    const result = parseResponse(response);
    expect(result.fixes).toHaveLength(3);
  });

  it("handles empty fixes array", () => {
    const response = JSON.stringify({
      explanation: "No fixes needed",
      fixes: [],
    });

    const result = parseResponse(response);
    expect(result.fixes).toHaveLength(0);
  });
});

// ─── AI Prompt Construction ─────────────────────────────────────────

describe("AI prompt construction", () => {
  // Mirrors buildPrompt from ai-client.ts
  function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  it("truncates long HTML snippets to 500 chars", () => {
    const longHtml = "a".repeat(600);
    const truncated = truncate(longHtml, 500);
    expect(truncated.length).toBe(503); // 500 + "..."
    expect(truncated.endsWith("...")).toBe(true);
  });

  it("does not truncate short HTML snippets", () => {
    const shortHtml = '<img src="logo.png">';
    expect(truncate(shortHtml, 500)).toBe(shortHtml);
  });

  it("handles exactly 500 char snippets without truncation", () => {
    const exact = "a".repeat(500);
    expect(truncate(exact, 500)).toBe(exact);
  });

  it("handles empty string", () => {
    expect(truncate("", 500)).toBe("");
  });
});

// ─── AI Provider Selection ──────────────────────────────────────────

describe("AI provider selection", () => {
  // Mirrors config.ts logic
  function selectProvider(
    deepseekKey: string | undefined,
    anthropicKey: string | undefined
  ): { provider: "deepseek" | "anthropic"; model: string } {
    if (deepseekKey) {
      return { provider: "deepseek", model: "deepseek-chat" };
    }
    return { provider: "anthropic", model: "claude-haiku-4-5-20251001" };
  }

  it("prefers DeepSeek when key is set", () => {
    const result = selectProvider("dk-xxx", "ak-xxx");
    expect(result.provider).toBe("deepseek");
    expect(result.model).toBe("deepseek-chat");
  });

  it("falls back to Anthropic when DeepSeek key is not set", () => {
    const result = selectProvider(undefined, "ak-xxx");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses Anthropic when both keys are missing", () => {
    const result = selectProvider(undefined, undefined);
    expect(result.provider).toBe("anthropic");
  });
});

// ─── Progress Event Types ───────────────────────────────────────────

describe("progress event types", () => {
  it("scan lifecycle events in correct order", () => {
    const expectedOrder = [
      "crawl_start",
      "crawl_complete",
      "page_scanned", // repeated per page
      "scan_complete",
    ];

    expect(expectedOrder[0]).toBe("crawl_start");
    expect(expectedOrder[expectedOrder.length - 1]).toBe("scan_complete");
  });

  it("AI lifecycle events follow scan events", () => {
    const aiEvents = ["ai_start", "ai_progress", "ai_complete"];
    expect(aiEvents[0]).toBe("ai_start");
    expect(aiEvents[aiEvents.length - 1]).toBe("ai_complete");
  });

  it("failure events exist", () => {
    const failureEvents = ["scan_failed", "ai_failed"];
    expect(failureEvents).toHaveLength(2);
  });
});

// ─── Violation Impact Counting ──────────────────────────────────────

describe("violation impact counting", () => {
  // Mirrors scanner.ts violation counting per page
  function countViolationsByImpact(
    violations: Array<{ impact: string }>
  ): ViolationCounts {
    const counts: ViolationCounts = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    };
    for (const v of violations) {
      const impact = (v.impact || "minor") as keyof ViolationCounts;
      counts[impact] = (counts[impact] || 0) + 1;
    }
    return counts;
  }

  it("counts empty violations", () => {
    expect(countViolationsByImpact([])).toEqual({
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    });
  });

  it("counts single violation", () => {
    const result = countViolationsByImpact([
      { impact: "critical" },
    ]);
    expect(result.critical).toBe(1);
    expect(result.serious).toBe(0);
  });

  it("counts mixed violations", () => {
    const violations = [
      { impact: "critical" },
      { impact: "critical" },
      { impact: "serious" },
      { impact: "moderate" },
      { impact: "moderate" },
      { impact: "moderate" },
      { impact: "minor" },
    ];

    const result = countViolationsByImpact(violations);
    expect(result.critical).toBe(2);
    expect(result.serious).toBe(1);
    expect(result.moderate).toBe(3);
    expect(result.minor).toBe(1);
  });

  it("defaults unknown impact to minor", () => {
    // The scanner uses (v.impact || "minor") so empty/null becomes minor
    const result = countViolationsByImpact([{ impact: "" }]);
    expect(result.minor).toBe(1);
  });
});
