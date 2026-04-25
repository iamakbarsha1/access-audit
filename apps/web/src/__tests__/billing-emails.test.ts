import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock Resend ---

const mockSend = vi.fn().mockResolvedValue({ id: "email_123" });

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

describe("billing emails", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  describe("when RESEND_API_KEY is set", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "re_test_key_123";
      process.env.BETTER_AUTH_URL = "https://app.accessaudit.com";
    });

    it("sendSubscriptionActiveEmail includes plan name in subject and body", async () => {
      const { sendSubscriptionActiveEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionActiveEmail("user@test.com", "Agency");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "AccessAudit <onboarding@resend.dev>",
          to: "user@test.com",
          subject: "Welcome to AccessAudit Agency!",
          html: expect.stringContaining("Agency"),
        })
      );
    });

    it("sendSubscriptionActiveEmail includes plan name in HTML body", async () => {
      const { sendSubscriptionActiveEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionActiveEmail("user@test.com", "Pro");

      const call = mockSend.mock.calls[0]![0];
      expect(call.html).toContain("Pro plan is active");
      expect(call.subject).toBe("Welcome to AccessAudit Pro!");
    });

    it("sendPaymentFailedEmail includes portal URL in body", async () => {
      const { sendPaymentFailedEmail } = await import(
        "@/lib/billing/emails"
      );
      const portalUrl =
        "https://app.accessaudit.com/api/auth/dodopayments/portal?customer_id=cust_123";
      await sendPaymentFailedEmail("user@test.com", portalUrl);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@test.com",
          subject: expect.stringContaining("Payment failed"),
          html: expect.stringContaining(portalUrl),
        })
      );
    });

    it("sendSubscriptionCancelledEmail includes reactivation link", async () => {
      const { sendSubscriptionCancelledEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionCancelledEmail("user@test.com");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@test.com",
          subject: expect.stringContaining("cancelled"),
          html: expect.stringContaining("/pricing"),
        })
      );
    });

    it("sendTrialExpiringEmail uses plural 'days' for daysLeft > 1", async () => {
      const { sendTrialExpiringEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendTrialExpiringEmail("user@test.com", 3);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Your AccessAudit trial expires in 3 days",
          html: expect.stringContaining("3 days"),
        })
      );
    });

    it("sendTrialExpiringEmail uses singular 'day' for daysLeft === 1", async () => {
      const { sendTrialExpiringEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendTrialExpiringEmail("user@test.com", 1);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Your AccessAudit trial expires in 1 day",
          html: expect.stringContaining("1 day"),
        })
      );
    });

    it("sendTrialExpiringEmail uses plural for daysLeft === 0", async () => {
      const { sendTrialExpiringEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendTrialExpiringEmail("user@test.com", 0);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Your AccessAudit trial expires in 0 days",
        })
      );
    });

    it("uses correct FROM address for all emails", async () => {
      const { sendSubscriptionActiveEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionActiveEmail("user@test.com", "Starter");

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "AccessAudit <onboarding@resend.dev>",
        })
      );
    });
  });

  describe("when RESEND_API_KEY is not set", () => {
    beforeEach(() => {
      delete process.env.RESEND_API_KEY;
      process.env.BETTER_AUTH_URL = "https://app.accessaudit.com";
    });

    it("logs to console instead of sending email for sendSubscriptionActiveEmail", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const { sendSubscriptionActiveEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionActiveEmail("user@test.com", "Agency");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DEV]")
      );
      consoleSpy.mockRestore();
    });

    it("logs to console instead of sending email for sendPaymentFailedEmail", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const { sendPaymentFailedEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendPaymentFailedEmail(
        "user@test.com",
        "https://example.com/portal"
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DEV]")
      );
      consoleSpy.mockRestore();
    });

    it("logs to console for sendSubscriptionCancelledEmail", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const { sendSubscriptionCancelledEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionCancelledEmail("user@test.com");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DEV]")
      );
      consoleSpy.mockRestore();
    });

    it("logs to console for sendTrialExpiringEmail", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const { sendTrialExpiringEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendTrialExpiringEmail("user@test.com", 5);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[DEV]")
      );
      consoleSpy.mockRestore();
    });

    it("console log includes recipient email", async () => {
      const consoleSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const { sendSubscriptionActiveEmail } = await import(
        "@/lib/billing/emails"
      );
      await sendSubscriptionActiveEmail("specific@email.com", "Starter");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("specific@email.com")
      );
      consoleSpy.mockRestore();
    });
  });
});
