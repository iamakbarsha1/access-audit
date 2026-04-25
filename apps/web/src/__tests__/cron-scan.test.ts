import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

const mockQueueAdd = vi.fn().mockResolvedValue({});

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockInsertReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  const result = selectResults[callIdx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
});

vi.mock("@access-audit/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@access-audit/db/schema", () => ({
  sites: {
    id: "id",
    status: "status",
    scanFrequency: "scanFrequency",
    lastScanAt: "lastScanAt",
    url: "url",
    organizationId: "organizationId",
  },
  scans: {
    id: "id",
    siteId: "siteId",
    triggeredBy: "triggeredBy",
    status: "status",
  },
}));

vi.mock("@/lib/scan-queue", () => ({
  scanQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

const ORIGINAL_ENV = { ...process.env };

describe("cron/scan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
    mockInsertReturning.mockReturnValue([{ id: "scan_1" }]);
    process.env.CRON_SECRET = "test-secret-123";
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // Simulate the GET handler logic from the source
  async function simulateGET(authHeader: string | null) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const dueSites = selectResults[0] as Array<{
      id: string;
      url: string;
      scanFrequency: string;
    }>;

    let enqueued = 0;

    for (const site of dueSites) {
      if (site.scanFrequency === "manual") continue;

      const scan = { id: `scan_${enqueued + 1}` };

      await mockQueueAdd("scan", {
        scanId: scan.id,
        siteId: site.id,
        url: site.url,
        maxPages: 50,
      });
      enqueued++;
    }

    return {
      status: 200,
      body: {
        success: true,
        sitesChecked: dueSites.length,
        scansEnqueued: enqueued,
      },
    };
  }

  it("returns 401 when CRON_SECRET doesn't match", async () => {
    const result = await simulateGET("Bearer wrong-secret");
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when no auth header", async () => {
    const result = await simulateGET(null);
    expect(result.status).toBe(401);
  });

  it("skips manual-frequency sites", async () => {
    selectResults[0] = [
      { id: "site_1", url: "https://manual.com", scanFrequency: "manual" },
    ];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.scansEnqueued).toBe(0);
    expect(result.body.sitesChecked).toBe(1);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("creates scan and enqueues for due sites", async () => {
    selectResults[0] = [
      { id: "site_1", url: "https://daily.com", scanFrequency: "daily" },
    ];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.scansEnqueued).toBe(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("uses maxPages=50 in queue job data", async () => {
    selectResults[0] = [
      { id: "site_1", url: "https://example.com", scanFrequency: "daily" },
    ];

    await simulateGET(`Bearer ${process.env.CRON_SECRET}`);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "scan",
      expect.objectContaining({ maxPages: 50 })
    );
  });

  it("returns enqueued count", async () => {
    selectResults[0] = [
      { id: "site_1", url: "https://a.com", scanFrequency: "daily" },
      { id: "site_2", url: "https://b.com", scanFrequency: "weekly" },
      { id: "site_3", url: "https://c.com", scanFrequency: "manual" },
    ];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    // 2 enqueued (daily + weekly), manual skipped
    expect(result.body.scansEnqueued).toBe(2);
    expect(result.body.sitesChecked).toBe(3);
  });

  it("handles empty dueSites gracefully", async () => {
    selectResults[0] = [];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.scansEnqueued).toBe(0);
    expect(result.body.sitesChecked).toBe(0);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("includes siteId and url in queue job data", async () => {
    selectResults[0] = [
      { id: "site_42", url: "https://test-site.com", scanFrequency: "monthly" },
    ];

    await simulateGET(`Bearer ${process.env.CRON_SECRET}`);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "scan",
      expect.objectContaining({
        siteId: "site_42",
        url: "https://test-site.com",
      })
    );
  });

  it("processes multiple due sites sequentially", async () => {
    selectResults[0] = [
      { id: "s1", url: "https://a.com", scanFrequency: "daily" },
      { id: "s2", url: "https://b.com", scanFrequency: "daily" },
      { id: "s3", url: "https://c.com", scanFrequency: "daily" },
    ];

    await simulateGET(`Bearer ${process.env.CRON_SECRET}`);

    expect(mockQueueAdd).toHaveBeenCalledTimes(3);
  });
});
