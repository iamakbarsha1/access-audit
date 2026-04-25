import { describe, it, expect } from "vitest";

// -----------------------------------------------------------------------
// Private utility functions copied from crawler.ts for direct unit testing.
// These mirror the source exactly and are not exported from the module.
// If the source changes, these tests should be updated accordingly.
// -----------------------------------------------------------------------

function normalizeUrl(url: string, origin: string): string | null {
  try {
    const resolved = new URL(url, origin);
    resolved.hash = "";
    let normalized = resolved.href;
    if (normalized.endsWith("/") && normalized !== resolved.origin + "/") {
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

function isSameDomain(url: string, origin: string): boolean {
  try {
    const urlHost = new URL(url).hostname;
    const originHost = new URL(origin).hostname;
    return urlHost === originHost;
  } catch {
    return false;
  }
}

function extractLocsFromXml(xml: string, urls: string[]): void {
  const locRegex = /<url>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/url>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    if (match[1]) {
      urls.push(match[1].trim());
    }
  }
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("normalizeUrl", () => {
  const origin = "https://example.com";

  it("resolves a relative URL against the origin", () => {
    expect(normalizeUrl("/about", origin)).toBe("https://example.com/about");
  });

  it("resolves a relative path without leading slash", () => {
    expect(normalizeUrl("contact", origin)).toBe("https://example.com/contact");
  });

  it("strips hash fragments from URLs", () => {
    expect(normalizeUrl("https://example.com/page#section", origin)).toBe(
      "https://example.com/page"
    );
  });

  it("strips trailing slashes (except root)", () => {
    expect(normalizeUrl("https://example.com/about/", origin)).toBe(
      "https://example.com/about"
    );
  });

  it("preserves trailing slash on root URL", () => {
    expect(normalizeUrl("https://example.com/", origin)).toBe(
      "https://example.com/"
    );
  });

  it("returns null for PDF files", () => {
    expect(normalizeUrl("/docs/report.pdf", origin)).toBeNull();
  });

  it("returns null for image files (jpg)", () => {
    expect(normalizeUrl("/images/photo.jpg", origin)).toBeNull();
  });

  it("returns null for image files (jpeg)", () => {
    expect(normalizeUrl("/images/photo.jpeg", origin)).toBeNull();
  });

  it("returns null for image files (png)", () => {
    expect(normalizeUrl("/images/logo.png", origin)).toBeNull();
  });

  it("returns null for image files (gif)", () => {
    expect(normalizeUrl("/images/anim.gif", origin)).toBeNull();
  });

  it("returns null for image files (svg)", () => {
    expect(normalizeUrl("/icons/icon.svg", origin)).toBeNull();
  });

  it("returns null for image files (webp)", () => {
    expect(normalizeUrl("/images/photo.webp", origin)).toBeNull();
  });

  it("returns null for CSS files", () => {
    expect(normalizeUrl("/styles/main.css", origin)).toBeNull();
  });

  it("returns null for JS files", () => {
    expect(normalizeUrl("/scripts/app.js", origin)).toBeNull();
  });

  it("returns null for ZIP files", () => {
    expect(normalizeUrl("/downloads/archive.zip", origin)).toBeNull();
  });

  it("returns null for XML files", () => {
    expect(normalizeUrl("/data/feed.xml", origin)).toBeNull();
  });

  it("returns null for JSON files", () => {
    expect(normalizeUrl("/api/data.json", origin)).toBeNull();
  });

  it("allows HTML pages (no extension)", () => {
    expect(normalizeUrl("/about", origin)).toBe("https://example.com/about");
  });

  it("allows HTML pages with .html extension", () => {
    // .html is NOT in the nonHtmlExts list, so it should be allowed
    expect(normalizeUrl("/page.html", origin)).toBe(
      "https://example.com/page.html"
    );
  });

  it("allows URLs with query parameters", () => {
    expect(normalizeUrl("/search?q=test", origin)).toBe(
      "https://example.com/search?q=test"
    );
  });

  it("returns null for completely invalid URLs", () => {
    expect(normalizeUrl("://invalid", "://also-invalid")).toBeNull();
  });

  it("handles absolute URLs from a different domain", () => {
    expect(normalizeUrl("https://other.com/page", origin)).toBe(
      "https://other.com/page"
    );
  });

  it("strips hash but keeps path and query", () => {
    expect(normalizeUrl("/page?foo=bar#section", origin)).toBe(
      "https://example.com/page?foo=bar"
    );
  });
});

describe("isSameDomain", () => {
  it("returns true for same domain", () => {
    expect(isSameDomain("https://example.com/page", "https://example.com")).toBe(
      true
    );
  });

  it("returns true for same domain with different paths", () => {
    expect(
      isSameDomain("https://example.com/a/b/c", "https://example.com/x")
    ).toBe(true);
  });

  it("returns true for same domain with different protocols", () => {
    expect(isSameDomain("http://example.com/page", "https://example.com")).toBe(
      true
    );
  });

  it("returns false for different domains", () => {
    expect(isSameDomain("https://other.com/page", "https://example.com")).toBe(
      false
    );
  });

  it("returns false for subdomains (treated as different)", () => {
    expect(
      isSameDomain("https://sub.example.com/page", "https://example.com")
    ).toBe(false);
  });

  it("returns false for invalid URL input", () => {
    expect(isSameDomain("not-a-url", "https://example.com")).toBe(false);
  });

  it("returns false for invalid origin input", () => {
    expect(isSameDomain("https://example.com", "not-a-url")).toBe(false);
  });

  it("returns false when both inputs are invalid", () => {
    expect(isSameDomain("garbage", "also-garbage")).toBe(false);
  });
});

describe("extractLocsFromXml", () => {
  it("extracts URLs from valid sitemap XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/about</loc>
  </url>
  <url>
    <loc>https://example.com/contact</loc>
    <changefreq>weekly</changefreq>
  </url>
</urlset>`;

    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    expect(urls).toEqual([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/contact",
    ]);
  });

  it("handles empty XML (no urls)", () => {
    const xml = `<?xml version="1.0"?><urlset></urlset>`;
    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    expect(urls).toEqual([]);
  });

  it("handles XML with no <url> tags", () => {
    const xml = `<html><body>Not a sitemap</body></html>`;
    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    expect(urls).toEqual([]);
  });

  it("handles malformed XML gracefully (partial tags)", () => {
    const xml = `<url><loc>https://example.com/valid</loc></url><url><loc>`;
    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    // Only the complete <url>...<loc>...</loc>...</url> should match
    expect(urls).toEqual(["https://example.com/valid"]);
  });

  it("trims whitespace around URLs", () => {
    const xml = `<url>
      <loc>  https://example.com/trimmed  </loc>
    </url>`;
    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    expect(urls).toEqual(["https://example.com/trimmed"]);
  });

  it("appends to existing array without overwriting", () => {
    const xml = `<url><loc>https://example.com/new</loc></url>`;
    const urls: string[] = ["https://example.com/existing"];
    extractLocsFromXml(xml, urls);

    expect(urls).toEqual([
      "https://example.com/existing",
      "https://example.com/new",
    ]);
  });

  it("handles multiple URLs with extra XML elements", () => {
    const xml = `<urlset>
      <url>
        <loc>https://example.com/page1</loc>
        <priority>0.8</priority>
        <lastmod>2024-01-01</lastmod>
      </url>
      <url>
        <loc>https://example.com/page2</loc>
        <changefreq>daily</changefreq>
      </url>
    </urlset>`;

    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    expect(urls).toEqual([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
  });

  it("ignores sitemap index <sitemap><loc> tags (only matches <url><loc>)", () => {
    const xml = `<sitemapindex>
      <sitemap>
        <loc>https://example.com/sitemap-posts.xml</loc>
      </sitemap>
    </sitemapindex>`;

    const urls: string[] = [];
    extractLocsFromXml(xml, urls);

    // <sitemap><loc> should NOT be matched, only <url><loc>
    expect(urls).toEqual([]);
  });
});
