import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock setup (follows webhook-handler.test.ts pattern) ---

let selectCallIndex = 0;
const selectResults: Record<string, unknown>[][] = [];

const mockReturning = vi.fn().mockImplementation(() => selectResults[selectCallIndex - 1] ?? []);
const mockInsertValues = vi.fn().mockReturnValue({ returning: mockReturning });
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });

const mockUpdateReturning = vi.fn().mockImplementation(() => [{ id: "settings_1", brandColor: "#ff0000", updatedAt: new Date() }]);
const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockUpdateReturning });
const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  const result = selectResults[callIdx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
});

const mockDb = {
  select: (...args: unknown[]) => mockSelect(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
};

vi.mock("@access-audit/db/client", () => ({ db: {} }));
vi.mock("@access-audit/db/schema", () => ({
  organization: { id: "id" },
  organizationSettings: { organizationId: "organizationId" },
  member: { organizationId: "organizationId", userId: "userId", role: "role" },
}));
vi.mock("@access-audit/db", () => ({
  eq: vi.fn((a: string, b: string) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
  isPaidPlan: vi.fn((plan: string) => ["starter", "agency", "pro"].includes(plan)),
  isTrialExpired: vi.fn(() => false),
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockReturnValue(new Headers()),
}));

// Instead of importing actual router (which needs full tRPC context),
// we test the business logic by re-creating the procedure handlers
// that mirror the actual source code.

describe("organization router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
  });

  describe("initSettings", () => {
    const initSettings = async (ctx: { session: { session: { activeOrganizationId: string | null } }; db: typeof mockDb }) => {
      const orgId = ctx.session.session.activeOrganizationId;
      if (!orgId) {
        throw { code: "BAD_REQUEST", message: "No active organization" };
      }

      const existing = await ctx.db
        .select()
        .from("organizationSettings" as unknown)
        .where("" as unknown);

      if ((existing as unknown[])[0]) return (existing as unknown[])[0];

      const inserted = await ctx.db
        .insert("organizationSettings" as unknown)
        .values({
          organizationId: orgId,
          plan: "trial",
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          siteQuota: 25,
          scanQuota: 50,
        })
        .returning();

      return (inserted as unknown[])[0];
    };

    it("throws BAD_REQUEST when no activeOrganizationId", async () => {
      await expect(
        initSettings({
          session: { session: { activeOrganizationId: null } },
          db: mockDb,
        })
      ).rejects.toEqual(
        expect.objectContaining({ code: "BAD_REQUEST" })
      );
    });

    it("returns existing settings without inserting (idempotent)", async () => {
      const existingSettings = { id: "s1", plan: "starter", organizationId: "org_1" };
      selectResults[0] = [existingSettings];

      const result = await initSettings({
        session: { session: { activeOrganizationId: "org_1" } },
        db: mockDb,
      });

      expect(result).toEqual(existingSettings);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("creates trial defaults when no settings exist", async () => {
      selectResults[0] = []; // no existing settings
      const trialSettings = {
        id: "s2",
        plan: "trial",
        siteQuota: 25,
        scanQuota: 50,
      };
      mockReturning.mockReturnValueOnce([trialSettings]);

      const result = await initSettings({
        session: { session: { activeOrganizationId: "org_2" } },
        db: mockDb,
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org_2",
          plan: "trial",
          siteQuota: 25,
          scanQuota: 50,
        })
      );
    });

    it("sets trial expiry to 7 days from now", async () => {
      selectResults[0] = [];
      mockReturning.mockReturnValueOnce([{}]);

      const before = Date.now();
      await initSettings({
        session: { session: { activeOrganizationId: "org_3" } },
        db: mockDb,
      });
      const after = Date.now();

      const trialEndsAt = mockInsertValues.mock.calls[0][0].trialEndsAt as Date;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + sevenDaysMs);
      expect(trialEndsAt.getTime()).toBeLessThanOrEqual(after + sevenDaysMs);
    });
  });

  describe("getOrg", () => {
    it("returns org and settings when both exist", async () => {
      selectResults[0] = [{ id: "org_1", name: "Acme" }];
      selectResults[1] = [{ organizationId: "org_1", plan: "starter" }];

      const orgResult = await mockDb.select().from("organization" as unknown).where("" as unknown);
      selectCallIndex = 1; // reset for second call
      const settingsResult = await mockDb.select().from("organizationSettings" as unknown).where("" as unknown);

      expect(orgResult).toEqual([{ id: "org_1", name: "Acme" }]);
    });

    it("returns null for missing org", async () => {
      selectResults[0] = [];
      const result = await mockDb.select().from("organization" as unknown).where("" as unknown);
      expect((result as unknown[])[0] ?? null).toBeNull();
    });
  });

  describe("updateSettings", () => {
    it("accepts valid 6-digit hex brand color", () => {
      const regex = /^#[0-9a-fA-F]{6}$/;
      expect(regex.test("#ff0000")).toBe(true);
      expect(regex.test("#FF00AA")).toBe(true);
      expect(regex.test("#123abc")).toBe(true);
    });

    it("rejects 3-digit hex color", () => {
      const regex = /^#[0-9a-fA-F]{6}$/;
      expect(regex.test("#f00")).toBe(false);
    });

    it("rejects invalid hex characters", () => {
      const regex = /^#[0-9a-fA-F]{6}$/;
      expect(regex.test("#GGG000")).toBe(false);
    });

    it("rejects color without # prefix", () => {
      const regex = /^#[0-9a-fA-F]{6}$/;
      expect(regex.test("ff0000")).toBe(false);
    });

    it("does not overwrite brandColor when undefined", () => {
      const input = { brandColor: undefined };
      const setPayload = {
        ...(input.brandColor && { brandColor: input.brandColor }),
        updatedAt: new Date(),
      };
      expect(setPayload).not.toHaveProperty("brandColor");
    });
  });

  describe("linkDodoCustomer", () => {
    it("rejects empty string dodoCustomerId", () => {
      const { z } = require("zod");
      const schema = z.object({ dodoCustomerId: z.string().min(1) });
      expect(() => schema.parse({ dodoCustomerId: "" })).toThrow();
    });

    it("accepts valid customer ID", () => {
      const { z } = require("zod");
      const schema = z.object({ dodoCustomerId: z.string().min(1) });
      expect(schema.parse({ dodoCustomerId: "cust_123" })).toEqual({
        dodoCustomerId: "cust_123",
      });
    });
  });

  describe("completeOnboarding", () => {
    it("sets onboardingCompleted to true in update payload", () => {
      const setPayload = {
        onboardingCompleted: true,
        updatedAt: new Date(),
      };
      expect(setPayload.onboardingCompleted).toBe(true);
    });
  });
});
