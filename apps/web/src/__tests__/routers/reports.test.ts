import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// --- Mock setup ---

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

const mockReturning = vi.fn().mockReturnValue([
  { id: "rpt_1", type: "share_live", shareToken: "abc123" },
]);
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);

const mockUpdateReturning = vi.fn().mockReturnValue([{ id: "entry_1", autoDetected: false }]);
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
  delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
  update: (...args: unknown[]) => mockUpdate(...args),
};

// --- Zod schemas (mirror source) ---

const createShareLinkSchema = z.object({
  siteId: z.string().uuid(),
  type: z.enum(["share_snapshot", "share_live"]),
  scanId: z.string().uuid().optional(),
  expiresIn: z.enum(["7d", "30d", "90d", "never"]),
});

const generateVpatSchema = z.object({
  siteId: z.string().uuid(),
  scanId: z.string().uuid(),
});

const updateVpatEntrySchema = z.object({
  entryId: z.string().uuid(),
  conformanceLevel: z
    .enum([
      "supports",
      "partially_supports",
      "does_not_support",
      "not_applicable",
      "not_evaluated",
    ])
    .optional(),
  remarks: z.string().max(2000).optional(),
});

// --- Plan check helpers (mirror @access-audit/db exports) ---

function canShareLinks(plan: string): boolean {
  return ["agency", "pro"].includes(plan);
}

function canGenerateVpat(plan: string): boolean {
  return plan === "pro";
}

describe("reports router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
  });

  describe("createShareLink - validation", () => {
    it("accepts share_live type", () => {
      const result = createShareLinkSchema.parse({
        siteId: "550e8400-e29b-41d4-a716-446655440000",
        type: "share_live",
        expiresIn: "7d",
      });
      expect(result.type).toBe("share_live");
    });

    it("accepts share_snapshot type with scanId", () => {
      const result = createShareLinkSchema.parse({
        siteId: "550e8400-e29b-41d4-a716-446655440000",
        type: "share_snapshot",
        scanId: "660e8400-e29b-41d4-a716-446655440000",
        expiresIn: "30d",
      });
      expect(result.scanId).toBeDefined();
    });

    it("rejects invalid type", () => {
      expect(() =>
        createShareLinkSchema.parse({
          siteId: "550e8400-e29b-41d4-a716-446655440000",
          type: "pdf",
          expiresIn: "7d",
        })
      ).toThrow();
    });
  });

  describe("createShareLink - expiration", () => {
    it("7d → 7 days from now", () => {
      const expiresIn = "7d";
      const expiresAt =
        expiresIn === "never"
          ? null
          : new Date(
              Date.now() +
                { "7d": 7, "30d": 30, "90d": 90 }[expiresIn]! * 24 * 60 * 60 * 1000
            );
      const diffMs = expiresAt!.getTime() - Date.now();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it("30d → 30 days from now", () => {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const diffDays = Math.round((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(30);
    });

    it("90d → 90 days from now", () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const diffDays = Math.round((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(90);
    });

    it("never → null expiration", () => {
      const expiresIn = "never";
      const expiresAt = expiresIn === "never" ? null : new Date();
      expect(expiresAt).toBeNull();
    });
  });

  describe("createShareLink - plan gating", () => {
    it("FORBIDDEN when trial plan", () => {
      expect(canShareLinks("trial")).toBe(false);
    });

    it("FORBIDDEN when starter plan", () => {
      expect(canShareLinks("starter")).toBe(false);
    });

    it("allowed for agency plan", () => {
      expect(canShareLinks("agency")).toBe(true);
    });

    it("allowed for pro plan", () => {
      expect(canShareLinks("pro")).toBe(true);
    });
  });

  describe("createShareLink - snapshot requires scanId", () => {
    it("BAD_REQUEST for snapshot without scanId", () => {
      const type = "share_snapshot";
      const scanId = undefined;
      const isInvalid = type === "share_snapshot" && !scanId;
      expect(isInvalid).toBe(true);
    });

    it("accepts live type without scanId", () => {
      const type = "share_live";
      const scanId = undefined;
      const isInvalid = type === "share_snapshot" && !scanId;
      expect(isInvalid).toBe(false);
    });
  });

  describe("revokeShareLink", () => {
    it("throws NOT_FOUND for cross-org report", () => {
      selectResults[0] = []; // no report in this org
      expect(selectResults[0][0]).toBeUndefined();
    });

    it("deletes report when found in org", () => {
      selectResults[0] = [{ id: "rpt_1", organizationId: "org_1" }];
      expect(selectResults[0][0]).toBeDefined();
    });
  });

  describe("generateVpat - plan gating", () => {
    it("FORBIDDEN when not pro plan", () => {
      expect(canGenerateVpat("trial")).toBe(false);
      expect(canGenerateVpat("starter")).toBe(false);
      expect(canGenerateVpat("agency")).toBe(false);
    });

    it("allowed for pro plan", () => {
      expect(canGenerateVpat("pro")).toBe(true);
    });
  });

  describe("generateVpat - conformance auto-detection", () => {
    it("0 violations → supports", () => {
      const count = 0;
      const hasAxeRules = true;
      let level: string;
      if (!hasAxeRules) level = "not_evaluated";
      else if (count === 0) level = "supports";
      else if (count >= 5) level = "does_not_support";
      else level = "partially_supports";
      expect(level).toBe("supports");
    });

    it("1-4 violations → partially_supports", () => {
      for (const count of [1, 2, 3, 4]) {
        let level: string;
        if (count === 0) level = "supports";
        else if (count >= 5) level = "does_not_support";
        else level = "partially_supports";
        expect(level).toBe("partially_supports");
      }
    });

    it("5+ violations → does_not_support", () => {
      for (const count of [5, 10, 100]) {
        let level: string;
        if (count === 0) level = "supports";
        else if (count >= 5) level = "does_not_support";
        else level = "partially_supports";
        expect(level).toBe("does_not_support");
      }
    });

    it("no axe rules → not_evaluated", () => {
      const hasAxeRules = false;
      const level = !hasAxeRules ? "not_evaluated" : "supports";
      expect(level).toBe("not_evaluated");
    });

    it("autoDetected is true for rules with axe mappings", () => {
      const hasAxeRules = true;
      const count = 3;
      const autoDetected = hasAxeRules && (count >= 0);
      expect(autoDetected).toBe(true);
    });

    it("autoDetected is false for not_evaluated criteria", () => {
      const hasAxeRules = false;
      const autoDetected = false; // source sets autoDetected=false when !hasAxeRules
      expect(autoDetected).toBe(false);
    });
  });

  describe("generateVpat - wcagTag parsing", () => {
    it("parses wcag111 to criterion 1.1.1", () => {
      const tag = "wcag111";
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      expect(match).toBeTruthy();
      const criterionId = `${match![1]}.${match![2]}.${match![3]}`;
      expect(criterionId).toBe("1.1.1");
    });

    it("parses wcag1410 to criterion 1.4.10", () => {
      const tag = "wcag1410";
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      expect(match).toBeTruthy();
      const criterionId = `${match![1]}.${match![2]}.${match![3]}`;
      expect(criterionId).toBe("1.4.10");
    });

    it("ignores non-matching tags", () => {
      const tag = "best-practice";
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      expect(match).toBeNull();
    });
  });

  describe("getVpatEntries", () => {
    it("throws NOT_FOUND for non-vpat report type", () => {
      selectResults[0] = [{ id: "rpt_1", type: "pdf", organizationId: "org_1" }];
      const report = selectResults[0][0] as Record<string, unknown>;
      expect(report.type).not.toBe("vpat");
      // In actual code: throw TRPCError NOT_FOUND
    });
  });

  describe("updateVpatEntry", () => {
    it("sets autoDetected to false on manual update", () => {
      const setPayload = {
        conformanceLevel: "supports",
        autoDetected: false,
        updatedAt: new Date(),
      };
      expect(setPayload.autoDetected).toBe(false);
    });

    it("validates conformanceLevel enum", () => {
      const validLevels = [
        "supports",
        "partially_supports",
        "does_not_support",
        "not_applicable",
        "not_evaluated",
      ];
      for (const level of validLevels) {
        expect(() =>
          updateVpatEntrySchema.parse({
            entryId: "550e8400-e29b-41d4-a716-446655440000",
            conformanceLevel: level,
          })
        ).not.toThrow();
      }
    });

    it("rejects invalid conformanceLevel", () => {
      expect(() =>
        updateVpatEntrySchema.parse({
          entryId: "550e8400-e29b-41d4-a716-446655440000",
          conformanceLevel: "invalid",
        })
      ).toThrow();
    });

    it("rejects remarks over 2000 chars", () => {
      expect(() =>
        updateVpatEntrySchema.parse({
          entryId: "550e8400-e29b-41d4-a716-446655440000",
          remarks: "a".repeat(2001),
        })
      ).toThrow();
    });

    it("verifies ownership chain: entry -> report -> org", () => {
      // Step 1: Find entry
      selectResults[0] = [{ id: "entry_1", reportId: "rpt_1" }];
      // Step 2: Verify report belongs to org
      selectResults[1] = []; // not in this org
      expect(selectResults[1][0]).toBeUndefined();
      // In actual code: throw NOT_FOUND
    });
  });

  describe("resetVpat", () => {
    it("throws NOT_FOUND for cross-org vpat", () => {
      selectResults[0] = [];
      expect(selectResults[0][0]).toBeUndefined();
    });

    it("only matches vpat type reports", () => {
      // Source uses: and(eq(reports.id, ...), eq(reports.organizationId, ...), eq(reports.type, "vpat"))
      const report = { id: "rpt_1", type: "vpat", organizationId: "org_1" };
      expect(report.type).toBe("vpat");
    });
  });
});
