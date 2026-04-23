import type { Browser } from "puppeteer";

/**
 * Hybrid page discovery: sitemap-first + link crawl supplement.
 * Returns a deduplicated list of URLs to scan, capped at maxPages.
 */
export async function discoverPages(
  browser: Browser,
  rootUrl: string,
  maxPages: number
): Promise<string[]> {
  const baseUrl = new URL(rootUrl);
  const discovered = new Set<string>();

  // Phase 1: Try sitemap
  const sitemapUrls = await fetchSitemapUrls(baseUrl.origin);
  for (const url of sitemapUrls) {
    if (discovered.size >= maxPages) break;
    const normalized = normalizeUrl(url, baseUrl.origin);
    if (normalized && isSameDomain(normalized, baseUrl.origin)) {
      discovered.add(normalized);
    }
  }

  // Phase 2: Link crawl from homepage to supplement
  if (discovered.size < maxPages) {
    const crawledUrls = await crawlLinks(browser, baseUrl.origin, maxPages);
    for (const url of crawledUrls) {
      if (discovered.size >= maxPages) break;
      discovered.add(url);
    }
  }

  return Array.from(discovered).slice(0, maxPages);
}

async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const urls: string[] = [];

  try {
    const response = await fetch(`${origin}/sitemap.xml`);
    if (!response.ok) return urls;

    const xml = await response.text();

    // Check if it's a sitemap index
    const sitemapIndexMatches = xml.match(/<sitemap>[\s\S]*?<loc>(.*?)<\/loc>[\s\S]*?<\/sitemap>/gi);
    if (sitemapIndexMatches) {
      // It's a sitemap index — fetch the first child sitemap
      const locMatch = sitemapIndexMatches[0]?.match(/<loc>(.*?)<\/loc>/i);
      if (locMatch?.[1]) {
        const childResponse = await fetch(locMatch[1]);
        if (childResponse.ok) {
          const childXml = await childResponse.text();
          extractLocsFromXml(childXml, urls);
        }
      }
    } else {
      extractLocsFromXml(xml, urls);
    }
  } catch {
    // Sitemap fetch failed — not an error, fall through to link crawl
  }

  return urls;
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

async function crawlLinks(
  browser: Browser,
  origin: string,
  maxPages: number
): Promise<string[]> {
  const discovered = new Set<string>();
  const page = await browser.newPage();

  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15000 });

    const hrefs = await page.$$eval("a[href]", (anchors) =>
      anchors.map((a) => a.getAttribute("href")).filter(Boolean)
    );

    for (const href of hrefs) {
      if (discovered.size >= maxPages) break;
      const normalized = normalizeUrl(href!, origin);
      if (normalized && isSameDomain(normalized, origin)) {
        discovered.add(normalized);
      }
    }
  } catch {
    // Link crawl failed — return what we have
  } finally {
    await page.close();
  }

  return Array.from(discovered);
}

function normalizeUrl(url: string, origin: string): string | null {
  try {
    const resolved = new URL(url, origin);
    // Strip fragment and trailing slash
    resolved.hash = "";
    let normalized = resolved.href;
    if (normalized.endsWith("/") && normalized !== resolved.origin + "/") {
      normalized = normalized.slice(0, -1);
    }

    // Filter out non-HTML resources
    const ext = resolved.pathname.split(".").pop()?.toLowerCase();
    const nonHtmlExts = ["pdf", "jpg", "jpeg", "png", "gif", "svg", "webp", "css", "js", "zip", "xml", "json"];
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
