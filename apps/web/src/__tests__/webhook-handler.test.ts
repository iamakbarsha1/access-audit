import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

// Track calls to db.update().set() for assertions
const mockUpdateSetWhere = vi.fn().mockResolvedValue([]);
const mockSet = vi.fn().mockReturnValue({ where: mockUpdateSetWhere });
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

// We'll configure select behavior per-test via selectCallIndex
let selectCallIndex = 0;

// Default return values for the two select calls:
// Call 1: findOrgByDodoCustomerId → db.select().from(organizationSettings).where(...)
// Call 2: getOrgOwnerEmail → db.select({...}).from(member).innerJoin(user, ...).where(...)
let orgSettingsResult: Record<string, unknown>[] = [];
let ownerEmailResult: Record<string, unknown>[] = [];

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  if (callIdx === 0) {
    // First select: findOrgByDodoCustomerId
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(orgSettingsResult),
      }),
    };
  }
  // Second select: getOrgOwnerEmail
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(ownerEmailResult),
      }),
    }),
  };
});

vi.mock("@access-audit/db/client", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  },
}));

vi.mock("@access-audit/db/schema", () => ({
  organizationSettings: {
    dodoCustomerId: "dodoCustomerId",
    organizationId: "organizationId",
  },
  user: { id: "id", email: "email" },
  member: {
    userId: "userId",
    organizationId: "organizationId",
    role: "role",
  },
}));

vi.mock("@access-audit/db", () => ({
  eq: (a: string, b: string) => ({ field: a, value: b }),
  getPlan: (key: string) => {
    const plans: Record<
      string,
      { name: string; siteQuota: number; pagesPerSite: number }
    > = {
      trial: { name: "Trial", siteQuota: 25, pagesPerSite: 50 },
      starter: { name: "Starter", siteQuota: 3, pagesPerSite: 25 },
      agency: { name: "Agency", siteQuota: 25, pagesPerSite: 50 },
      pro: { name: "Pro", siteQuota: -1, pagesPerSite: 200 },
    };
    return plans[key] ?? plans.trial;
  },
}));

// Mock billing emails
const mockSendSubscriptionActiveEmail = vi
  .fn()
  .mockResolvedValue(undefined);
const mockSendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);
const mockSendSubscriptionCancelledEmail = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("@/lib/billing/emails", () => ({
  sendSubscriptionActiveEmail: (...args: unknown[]) =>
    mockSendSubscriptionActiveEmail(...args),
  sendPaymentFailedEmail: (...args: unknown[]) =>
    mockSendPaymentFailedEmail(...args),
  sendSubscriptionCancelledEmail: (...args: unknown[]) =>
    mockSendSubscriptionCancelledEmail(...args),
}));

const ORIGINAL_ENV = { ...process.env };

import { handleDodoWebhook } from "@/lib/billing/webhook-handler";

describe("handleDodoWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;

    process.env.DODO_PRODUCT_STARTER = "prod_starter_123";
    process.env.DODO_PRODUCT_AGENCY = "prod_agency_456";
    process.env.DODO_PRODUCT_PRO = "prod_pro_789";
    process.env.BETTER_AUTH_URL = "https://app.accessaudit.com";

    // Default: org found with valid owner
    orgSettingsResult = [
      { organizationId: "org_1", dodoCustomerId: "cust_123" },
    ];
    ownerEmailResult = [{ email: "owner@agency.com", role: "owner" }];
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const makePayload = (overrides: Record<string, unknown> = {}) => ({
    data: {
      customer_id: "cust_123",
      subscription_id: "sub_456",
      product_id: "prod_starter_123",
      ...overrides,
    },
  });

  describe("missing customer_id", () => {
    it("logs error and returns early when no customer_id in payload", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await handleDodoWebhook("subscription.active", { data: {} });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No customer_id"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });
  });

  describe("org not found", () => {
    it("logs error when no org matches customer_id", async () => {
      orgSettingsResult = [];
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await handleDodoWebhook("subscription.active", makePayload());
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("No org found"),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });
  });

  describe("resolveProductToPlan (tested via webhook events)", () => {
    it("maps DODO_PRODUCT_STARTER to 'starter' plan", async () => {
      await handleDodoWebhook(
        "subscription.active",
        makePayload({ product_id: "prod_starter_123" })
      );
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "starter" })
      );
    });

    it("maps DODO_PRODUCT_AGENCY to 'agency' plan", async () => {
      await handleDodoWebhook(
        "subscription.active",
        makePayload({ product_id: "prod_agency_456" })
      );
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "agency" })
      );
    });

    it("maps DODO_PRODUCT_PRO to 'pro' plan", async () => {
      await handleDodoWebhook(
        "subscription.active",
        makePayload({ product_id: "prod_pro_789" })
      );
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "pro" })
      );
    });

    it("maps unknown product to 'trial' plan", async () => {
      await handleDodoWebhook(
        "subscription.active",
        makePayload({ product_id: "prod_unknown_000" })
      );
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "trial" })
      );
    });
  });

  describe("subscription.active", () => {
    it("updates plan, sets quotas, and sends email", async () => {
      await handleDodoWebhook("subscription.active", makePayload());

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "starter",
          dodoSubscriptionId: "sub_456",
          siteQuota: 3,
          scanQuota: 25,
        })
      );
      expect(mockSendSubscriptionActiveEmail).toHaveBeenCalledWith(
        "owner@agency.com",
        "Starter"
      );
    });

    it("sets siteQuota to 999999 for pro plan (unlimited)", async () => {
      await handleDodoWebhook(
        "subscription.active",
        makePayload({ product_id: "prod_pro_789" })
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "pro",
          siteQuota: 999999,
          scanQuota: 200,
        })
      );
    });
  });

  describe("subscription.on_hold", () => {
    it("downgrades to trial and sends payment failed email", async () => {
      await handleDodoWebhook("subscription.on_hold", makePayload());

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ plan: "trial" })
      );
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith(
        "owner@agency.com",
        expect.stringContaining("cust_123")
      );
    });

    it("includes portal URL with customer_id in payment failed email", async () => {
      await handleDodoWebhook("subscription.on_hold", makePayload());

      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith(
        "owner@agency.com",
        "https://app.accessaudit.com/api/auth/dodopayments/portal?customer_id=cust_123"
      );
    });
  });

  describe("subscription.cancelled", () => {
    it("downgrades to trial, clears subscription ID, and sends email", async () => {
      await handleDodoWebhook("subscription.cancelled", makePayload());

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "trial",
          dodoSubscriptionId: null,
        })
      );
      expect(mockSendSubscriptionCancelledEmail).toHaveBeenCalledWith(
        "owner@agency.com"
      );
    });
  });

  describe("subscription.expired", () => {
    it("behaves same as cancelled: downgrades and sends email", async () => {
      await handleDodoWebhook("subscription.expired", makePayload());

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "trial",
          dodoSubscriptionId: null,
        })
      );
      expect(mockSendSubscriptionCancelledEmail).toHaveBeenCalledWith(
        "owner@agency.com"
      );
    });
  });

  describe("subscription.plan_changed", () => {
    it("updates plan and quotas without sending email", async () => {
      await handleDodoWebhook(
        "subscription.plan_changed",
        makePayload({ product_id: "prod_agency_456" })
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: "agency",
          siteQuota: 25,
          scanQuota: 50,
        })
      );
      expect(mockSendSubscriptionActiveEmail).not.toHaveBeenCalled();
      expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
      expect(mockSendSubscriptionCancelledEmail).not.toHaveBeenCalled();
    });
  });

  describe("subscription.renewed", () => {
    it("logs renewal and does not modify database", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      await handleDodoWebhook("subscription.renewed", makePayload());

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("renewed")
      );
      expect(mockSet).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("subscription.failed", () => {
    it("logs error and does not modify database", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await handleDodoWebhook("subscription.failed", makePayload());

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("failed"),
        expect.anything()
      );
      expect(mockSet).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("unknown event", () => {
    it("logs unhandled event type", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      await handleDodoWebhook("order.completed", makePayload());

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unhandled event")
      );
      consoleSpy.mockRestore();
    });
  });

  describe("payload format handling", () => {
    it("handles payload with customerId (camelCase) instead of customer_id", async () => {
      const payload = {
        data: {
          customerId: "cust_123",
          subscriptionId: "sub_456",
          productId: "prod_starter_123",
        },
      };
      await handleDodoWebhook("subscription.active", payload);
      expect(mockSendSubscriptionActiveEmail).toHaveBeenCalled();
    });

    it("handles payload without data wrapper", async () => {
      const payload = {
        customer_id: "cust_123",
        subscription_id: "sub_456",
        product_id: "prod_starter_123",
      };
      await handleDodoWebhook("subscription.active", payload);
      expect(mockSendSubscriptionActiveEmail).toHaveBeenCalled();
    });
  });
});
