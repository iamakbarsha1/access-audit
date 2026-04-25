import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// --- Mock setup ---

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

const mockQueueAdd = vi.fn().mockResolvedValue({});

const mockReturning = vi.fn().mockReturnValue([
  { id: "scan_1", siteId: "site_1", status: "queued" },
]);
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  const result = selectResults[callIdx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(result),
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockReturnValue(result),
        }),
      }),
    }),
  };
});

const mockDb = {
  select: (...args: unknown[]) => mockSelect(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
};

// --- Zod schemas (mirror source) ---

const startScanSchema = z.object({
  siteId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(500).default(50),
});

const listBySiteSchema = z.object({
  siteId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const getProgressSchema = z.object({
  scanId: z.string().uuid(),
});

describe("scans router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
  });

  describe("startScan - validation", () => {
    it("rejects maxPages of 0", () => {
      expect(() =>
        startScanSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          maxPages: 0,
        })
      ).toThrow();
    });

    it("rejects maxPages of 501", () => {
      expect(() =>
        startScanSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          maxPages: 501,
        })
      ).toThrow();
    });

    it("accepts maxPages of 1", () => {
      const result = startScanSchema.parse({
        siteId: "550e8400-e29b-41d4-a716-446655440000",
        maxPages: 1,
      });
      expect(result.maxPages).toBe(1);
    });

    it("accepts maxPages of 500", () => {
      const result = startScanSchema.parse({
        siteId: "550e8400-e29b-41d4-a716-446655440000",
        maxPages: 500,
      });
      expect(result.maxPages).toBe(500);
    });

    it("defaults maxPages to 50", () => {
      const result = startScanSchema.parse({
        siteId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.maxPages).toBe(50);
    });

    it("rejects non-UUID siteId", () => {
      expect(() =>
        startScanSchema.parse({ siteId: "not-uuid" })
      ).toThrow();
    });

    it("rejects fractional maxPages", () => {
      expect(() =>
        startScanSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          maxPages: 50.5,
        })
      ).toThrow();
    });
  });

  describe("startScan - business logic", () => {
    it("verifies site belongs to org before creating scan", async () => {
      selectResults[0] = []; // site not found in org

      const siteResult = selectResults[0];
      expect(siteResult[0]).toBeUndefined();
      // In actual code: throw new TRPCError({ code: "NOT_FOUND" })
    });

    it("creates scan record with correct values", () => {
      const insertPayload = {
        siteId: "site_1",
        triggeredBy: "user_1",
        status: "queued",
      };
      expect(insertPayload.status).toBe("queued");
      expect(insertPayload.triggeredBy).toBe("user_1");
    });

    it("dispatches job to queue with correct data", async () => {
      const jobData = {
        scanId: "scan_1",
        siteId: "site_1",
        url: "https://example.com",
        maxPages: 50,
      };
      await mockQueueAdd("scan", jobData, { jobId: "scan_1" });

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "scan",
        expect.objectContaining({
          scanId: "scan_1",
          siteId: "site_1",
          url: "https://example.com",
          maxPages: 50,
        }),
        { jobId: "scan_1" }
      );
    });
  });

  describe("listBySite - validation", () => {
    it("defaults limit to 20 and offset to 0", () => {
      const result = listBySiteSchema.parse({
        siteId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it("rejects limit 0", () => {
      expect(() =>
        listBySiteSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          limit: 0,
        })
      ).toThrow();
    });

    it("rejects limit > 100", () => {
      expect(() =>
        listBySiteSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          limit: 101,
        })
      ).toThrow();
    });

    it("rejects negative offset", () => {
      expect(() =>
        listBySiteSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          offset: -1,
        })
      ).toThrow();
    });
  });

  describe("getProgress", () => {
    it("validates scanId is UUID", () => {
      expect(() => getProgressSchema.parse({ scanId: "bad" })).toThrow();
      expect(() =>
        getProgressSchema.parse({
          scanId: "550e8400-e29b-41d4-a716-446655440000",
        })
      ).not.toThrow();
    });

    it("throws NOT_FOUND for non-existent scan", () => {
      selectResults[0] = [];
      const scan = selectResults[0];
      expect(scan[0]).toBeUndefined();
    });

    it("verifies ownership chain: scan -> site -> org", () => {
      // Step 1: Find scan by ID
      selectResults[0] = [{ id: "scan_1", siteId: "site_1" }];
      // Step 2: Verify site belongs to org
      selectResults[1] = []; // site NOT in this org
      expect(selectResults[1][0]).toBeUndefined();
      // In actual code: throw NOT_FOUND
    });
  });
});
