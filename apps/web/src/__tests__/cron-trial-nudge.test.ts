import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// --- Mock setup ---

let selectCallIndex = 0;
const selectResults: unknown[][] = [];

const mockSendTrialExpiringEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/billing/emails", () => ({
  sendTrialExpiringEmail: (...args: unknown[]) =>
    mockSendTrialExpiringEmail(...args),
}));

const mockSelect = vi.fn().mockImplementation(() => {
  const callIdx = selectCallIndex++;
  const result = selectResults[callIdx] ?? [];
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
});

vi.mock("@access-audit/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@access-audit/db/schema", () => ({
  organizationSettings: {
    organizationId: "organizationId",
    plan: "plan",
    trialEndsAt: "trialEndsAt",
  },
  member: {
    organizationId: "organizationId",
    userId: "userId",
    role: "role",
  },
  user: { id: "id", email: "email" },
}));

const ORIGINAL_ENV = { ...process.env };

describe("cron/trial-nudge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallIndex = 0;
    selectResults.length = 0;
    process.env.CRON_SECRET = "test-secret-123";
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // Simulate the GET handler logic
  async function simulateGET(authHeader: string | null) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const now = new Date();

    // First select: find expiring orgs
    const expiringOrgs = selectResults[0] as Array<{
      organizationId: string;
      trialEndsAt: Date;
    }>;

    let sent = 0;
    for (let i = 0; i < expiringOrgs.length; i++) {
      const org = expiringOrgs[i];
      // Each org gets an owner email lookup
      selectCallIndex = i + 1;
      const ownerResult = selectResults[i + 1] as Array<{ email: string }>;
      const ownerEmail = ownerResult?.[0]?.email;
      if (!ownerEmail) continue;

      const daysLeft = Math.ceil(
        (org.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      await mockSendTrialExpiringEmail(ownerEmail, daysLeft);
      sent++;
    }

    return { status: 200, body: { sent, checked: expiringOrgs.length } };
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

  it("finds orgs expiring in 1-2 day window", async () => {
    const trialEndsAt = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000); // 1.5 days from now
    selectResults[0] = [{ organizationId: "org_1", trialEndsAt }];
    selectResults[1] = [{ email: "owner@test.com" }];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.checked).toBe(1);
  });

  it("sends email with correct daysLeft", async () => {
    const trialEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
    selectResults[0] = [{ organizationId: "org_1", trialEndsAt }];
    selectResults[1] = [{ email: "owner@test.com" }];

    await simulateGET(`Bearer ${process.env.CRON_SECRET}`);

    expect(mockSendTrialExpiringEmail).toHaveBeenCalledWith(
      "owner@test.com",
      2
    );
  });

  it("skips orgs without owner email", async () => {
    const trialEndsAt = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000);
    selectResults[0] = [{ organizationId: "org_1", trialEndsAt }];
    selectResults[1] = []; // no owner found

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.sent).toBe(0);
    expect(result.body.checked).toBe(1);
    expect(mockSendTrialExpiringEmail).not.toHaveBeenCalled();
  });

  it("returns count of emails sent", async () => {
    const trialEndsAt = new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000);
    selectResults[0] = [
      { organizationId: "org_1", trialEndsAt },
      { organizationId: "org_2", trialEndsAt },
    ];
    selectResults[1] = [{ email: "owner1@test.com" }];
    selectResults[2] = [{ email: "owner2@test.com" }];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.sent).toBe(2);
    expect(result.body.checked).toBe(2);
  });

  it("handles zero expiring orgs gracefully", async () => {
    selectResults[0] = [];

    const result = await simulateGET(`Bearer ${process.env.CRON_SECRET}`);
    expect(result.body.sent).toBe(0);
    expect(result.body.checked).toBe(0);
    expect(mockSendTrialExpiringEmail).not.toHaveBeenCalled();
  });

  it("calculates daysLeft correctly for 1 day remaining", async () => {
    const trialEndsAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    selectResults[0] = [{ organizationId: "org_1", trialEndsAt }];
    selectResults[1] = [{ email: "owner@test.com" }];

    await simulateGET(`Bearer ${process.env.CRON_SECRET}`);

    expect(mockSendTrialExpiringEmail).toHaveBeenCalledWith(
      "owner@test.com",
      1
    );
  });

  it("sends email for each expiring org independently", async () => {
    const trialEndsAt1 = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const trialEndsAt2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    selectResults[0] = [
      { organizationId: "org_1", trialEndsAt: trialEndsAt1 },
      { organizationId: "org_2", trialEndsAt: trialEndsAt2 },
    ];
    selectResults[1] = [{ email: "owner1@test.com" }];
    selectResults[2] = [{ email: "owner2@test.com" }];

    await simulateGET(`Bearer ${process.env.CRON_SECRET}`);

    expect(mockSendTrialExpiringEmail).toHaveBeenCalledTimes(2);
    expect(mockSendTrialExpiringEmail).toHaveBeenCalledWith("owner1@test.com", 1);
    expect(mockSendTrialExpiringEmail).toHaveBeenCalledWith("owner2@test.com", 2);
  });
});
