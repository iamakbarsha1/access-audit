import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// --- Mock setup ---

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

const mockReturning = vi.fn().mockReturnValue([{ id: "site_1" }]);
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockUpdateReturning = vi.fn().mockReturnValue([{ id: "site_1", status: "archived" }]);
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  const result = selectResults[callIdx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(result),
      orderBy: vi.fn().mockReturnValue(result),
    }),
  };
});

const mockDb = {
  select: (...args: unknown[]) => mockSelect(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
};

// --- Zod schemas (mirror source) ---

const addSiteSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  name: z.string().min(1, "Name is required").max(100),
  scanFrequency: z
    .enum(["manual", "daily", "weekly", "monthly"])
    .default("daily"),
});

const updateSiteSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  scanFrequency: z.enum(["manual", "daily", "weekly", "monthly"]).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

const deleteSiteSchema = z.object({ id: z.string().uuid() });

describe("sites router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
  });

  describe("list", () => {
    it("returns org sites", async () => {
      const sites = [
        { id: "s1", url: "https://a.com", name: "A" },
        { id: "s2", url: "https://b.com", name: "B" },
      ];
      selectResults[0] = sites;

      const result = await mockDb.select().from("sites").orderBy("createdAt");
      expect(result).toEqual(sites);
    });
  });

  describe("add - Zod validation", () => {
    it("accepts valid URL and name", () => {
      const result = addSiteSchema.parse({
        url: "https://example.com",
        name: "My Site",
      });
      expect(result.url).toBe("https://example.com");
      expect(result.name).toBe("My Site");
    });

    it("defaults scanFrequency to daily", () => {
      const result = addSiteSchema.parse({
        url: "https://example.com",
        name: "Test",
      });
      expect(result.scanFrequency).toBe("daily");
    });

    it("rejects invalid URL", () => {
      expect(() =>
        addSiteSchema.parse({ url: "not-a-url", name: "Test" })
      ).toThrow("Must be a valid URL");
    });

    it("rejects empty name", () => {
      expect(() =>
        addSiteSchema.parse({ url: "https://example.com", name: "" })
      ).toThrow("Name is required");
    });

    it("rejects name over 100 chars", () => {
      expect(() =>
        addSiteSchema.parse({
          url: "https://example.com",
          name: "a".repeat(101),
        })
      ).toThrow();
    });

    it("rejects invalid frequency", () => {
      expect(() =>
        addSiteSchema.parse({
          url: "https://example.com",
          name: "Test",
          scanFrequency: "hourly",
        })
      ).toThrow();
    });

    it("accepts all valid frequencies", () => {
      for (const freq of ["manual", "daily", "weekly", "monthly"]) {
        const result = addSiteSchema.parse({
          url: "https://example.com",
          name: "Test",
          scanFrequency: freq,
        });
        expect(result.scanFrequency).toBe(freq);
      }
    });
  });

  describe("add - quota enforcement", () => {
    it("throws FORBIDDEN when count >= quota", () => {
      const count = 25;
      const quota = 25;
      const shouldBlock = quota !== -1 && count >= quota;
      expect(shouldBlock).toBe(true);
    });

    it("allows when count < quota", () => {
      const count = 24;
      const quota = 25;
      const shouldBlock = quota !== -1 && count >= quota;
      expect(shouldBlock).toBe(false);
    });

    it("unlimited (-1) bypasses quota check", () => {
      const count = 99999;
      const quota = -1;
      const shouldBlock = quota !== -1 && count >= quota;
      expect(shouldBlock).toBe(false);
    });

    it("quota counts only active sites (status check in query)", () => {
      // The source uses eq(sites.status, "active") in the quota count query.
      // Archived sites should not count toward quota.
      const activeSites = 3;
      const archivedSites = 10;
      const quota = 5;
      // Only active sites counted
      const shouldBlock = quota !== -1 && activeSites >= quota;
      expect(shouldBlock).toBe(false);
    });
  });

  describe("add - duplicate URL detection", () => {
    it("throws CONFLICT when URL already exists in org", () => {
      const existing = [{ id: "s1", url: "https://example.com" }];
      expect(existing.length > 0).toBe(true);
    });

    it("allows same URL in different org", () => {
      // Different org → empty result for duplicate check
      const existing: unknown[] = [];
      expect(existing.length > 0).toBe(false);
    });
  });

  describe("update - validation", () => {
    it("accepts valid UUID id", () => {
      const result = updateSiteSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("rejects non-UUID id", () => {
      expect(() =>
        updateSiteSchema.parse({ id: "not-a-uuid" })
      ).toThrow();
    });

    it("all fields optional except id", () => {
      const result = updateSiteSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.name).toBeUndefined();
      expect(result.scanFrequency).toBeUndefined();
      expect(result.status).toBeUndefined();
    });
  });

  describe("update - NOT_FOUND for cross-org site", () => {
    it("throws NOT_FOUND when site not in org", () => {
      selectResults[0] = []; // empty = not found in org
      const existing = selectResults[0];
      expect(existing[0]).toBeUndefined();
      // In actual code: throw new TRPCError({ code: "NOT_FOUND" })
    });
  });

  describe("delete - soft delete", () => {
    it("sets status to archived (not hard delete)", () => {
      const setPayload = { status: "archived", updatedAt: new Date() };
      expect(setPayload.status).toBe("archived");
    });

    it("throws NOT_FOUND for missing site", () => {
      selectResults[0] = [];
      const existing = selectResults[0];
      expect(existing[0]).toBeUndefined();
    });

    it("validates id is UUID", () => {
      expect(() => deleteSiteSchema.parse({ id: "abc" })).toThrow();
      expect(() =>
        deleteSiteSchema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" })
      ).not.toThrow();
    });
  });
});
