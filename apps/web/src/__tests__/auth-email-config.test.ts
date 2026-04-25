import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mock external dependencies before importing auth ---

const mockResendSend = vi.fn().mockResolvedValue({ id: "email_123" });

vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = { send: (...args: unknown[]) => mockResendSend(...args) };
    },
  };
});

vi.mock("@access-audit/db/client", () => ({ db: {} }));

vi.mock("dodopayments", () => ({
  default: class MockDodoPayments {},
}));

vi.mock("@dodopayments/better-auth", () => ({
  dodopayments: vi.fn().mockReturnValue({}),
  checkout: vi.fn().mockReturnValue({}),
  portal: vi.fn().mockReturnValue({}),
  webhooks: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/billing/webhook-handler", () => ({
  handleDodoWebhook: vi.fn(),
}));

vi.mock("better-auth/plugins", () => ({
  organization: vi.fn().mockImplementation((config: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__orgPluginCfg = config;
    return {};
  }),
}));

vi.mock("better-auth", () => ({
  betterAuth: vi.fn().mockImplementation((config: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__betterAuthCfg = config;
    return {
      $Infer: { Session: {} },
      api: {},
      handler: vi.fn(),
    };
  }),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn().mockReturnValue({}),
}));

const ORIGINAL_ENV = { ...process.env };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfg = () => (globalThis as any).__betterAuthCfg as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orgCfg = () => (globalThis as any).__orgPluginCfg as Record<string, any>;

beforeAll(async () => {
  // Set env vars BEFORE the dynamic import triggers auth.ts module evaluation
  process.env.RESEND_API_KEY = "re_test_123";
  process.env.BETTER_AUTH_SECRET = "test-secret";
  process.env.BETTER_AUTH_URL = "https://app.accessaudit.com";
  process.env.GITHUB_CLIENT_ID = "gh_client_id";
  process.env.GITHUB_CLIENT_SECRET = "gh_client_secret";
  process.env.DODO_PAYMENTS_API_KEY = "dodo_test_key";
  process.env.DODO_PAYMENTS_ENVIRONMENT = "test_mode";
  process.env.DODO_PRODUCT_STARTER = "prod_starter";
  process.env.DODO_PRODUCT_AGENCY = "prod_agency";
  process.env.DODO_PRODUCT_PRO = "prod_pro";
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = "whk_test";

  // Dynamic import so env vars are set before module evaluates
  await import("@/lib/auth");
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__betterAuthCfg;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__orgPluginCfg;
});

describe("auth email configuration", () => {
  describe("emailAndPassword config", () => {
    it("has email+password enabled", () => {
      expect(cfg().emailAndPassword.enabled).toBe(true);
    });

    it("requires email verification", () => {
      expect(cfg().emailAndPassword.requireEmailVerification).toBe(true);
    });
  });

  describe("emailVerification config", () => {
    it("has sendOnSignUp set to true", () => {
      expect(cfg().emailVerification.sendOnSignUp).toBe(true);
    });

    it("sendVerificationEmail calls Resend when API key is set", async () => {
      await cfg().emailVerification.sendVerificationEmail({
        user: { email: "test@example.com", name: "Test User" },
        url: "https://verify.example.com/token123",
      });

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "AccessAudit <onboarding@resend.dev>",
          to: "test@example.com",
          subject: "Verify your AccessAudit account",
        })
      );
    });

    it("includes user name in verification email HTML", async () => {
      await cfg().emailVerification.sendVerificationEmail({
        user: { email: "test@example.com", name: "Alice" },
        url: "https://verify.example.com/t",
      });

      const html = mockResendSend.mock.calls[0][0].html as string;
      expect(html).toContain("Hi Alice");
    });

    it("includes verification URL as link in email HTML", async () => {
      const verifyUrl = "https://verify.example.com/unique-token";
      await cfg().emailVerification.sendVerificationEmail({
        user: { email: "test@example.com", name: "Alice" },
        url: verifyUrl,
      });

      const html = mockResendSend.mock.calls[0][0].html as string;
      expect(html).toContain(`href="${verifyUrl}"`);
    });

    it("sendVerificationEmail is a function", () => {
      expect(cfg().emailVerification.sendVerificationEmail).toBeTypeOf("function");
    });
  });

  describe("session config", () => {
    it("session expires in 30 days", () => {
      expect(cfg().session.expiresIn).toBe(60 * 60 * 24 * 30);
    });

    it("cookie cache is enabled with 5-minute maxAge", () => {
      expect(cfg().session.cookieCache.enabled).toBe(true);
      expect(cfg().session.cookieCache.maxAge).toBe(60 * 5);
    });
  });

  describe("socialProviders config", () => {
    it("has GitHub OAuth enabled when client ID is set", () => {
      expect(cfg().socialProviders.github.enabled).toBe(true);
    });
  });

  describe("organization invitation email", () => {
    it("sendInvitationEmail calls Resend with inviter/org info", async () => {
      await orgCfg().sendInvitationEmail({
        id: "inv_123",
        email: "newuser@example.com",
        role: "admin",
        inviter: { user: { name: "Boss" } },
        organization: { name: "Acme Agency" },
      });

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "newuser@example.com",
          subject: "Boss invited you to Acme Agency on AccessAudit",
        })
      );
    });

    it("includes invite link with correct base URL", async () => {
      await orgCfg().sendInvitationEmail({
        id: "inv_456",
        email: "user@test.com",
        role: "member",
        inviter: { user: { name: "Admin" } },
        organization: { name: "Test Org" },
      });

      const html = mockResendSend.mock.calls[0][0].html as string;
      expect(html).toContain("https://app.accessaudit.com/invite/inv_456");
    });

    it("includes role in invitation email body", async () => {
      await orgCfg().sendInvitationEmail({
        id: "inv_789",
        email: "user@test.com",
        role: "admin",
        inviter: { user: { name: "Owner" } },
        organization: { name: "My Org" },
      });

      const html = mockResendSend.mock.calls[0][0].html as string;
      expect(html).toContain("<strong>admin</strong>");
    });
  });
});
