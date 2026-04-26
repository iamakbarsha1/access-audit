import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@access-audit/db/client";
import { Resend } from "resend";
import {
  dodopayments,
  checkout,
  portal,
  webhooks,
} from "@dodopayments/better-auth";
import DodoPayments from "dodopayments";
import { handleDodoWebhook } from "@/lib/billing/webhook-handler";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const dodoClient = process.env.DODO_PAYMENTS_API_KEY
  ? new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY,
      environment:
        (process.env.DODO_PAYMENTS_ENVIRONMENT as
          | "test_mode"
          | "live_mode") ?? "test_mode",
    })
  : (null as unknown as DodoPayments);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      enabled: !!process.env.GITHUB_CLIENT_ID,
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[AUTH] Verification URL for ${user.email}: ${url}`);
      }
      if (!resend) {
        console.warn(`[AUTH] RESEND_API_KEY not set — verification email NOT sent for ${user.email}`);
        return;
      }
      try {
        const result = await resend.emails.send({
          from: "AccessAudit <onboarding@resend.dev>",
          to: user.email,
          subject: "Verify your AccessAudit account",
          html: `
            <h2>Welcome to AccessAudit!</h2>
            <p>Hi ${user.name},</p>
            <p>Please verify your email address by clicking the link below:</p>
            <a href="${url}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
              Verify Email
            </a>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          `,
        });
        if (result.error) {
          console.error(`[AUTH] Resend API error for ${user.email}:`, result.error);
        } else {
          console.log(`[AUTH] Verification email sent to ${user.email}, id: ${result.data?.id}`);
        }
      } catch (err) {
        console.error(`[AUTH] Failed to send verification email to ${user.email}:`, err);
      }
    },
  },

  plugins: [
    organization({
      async sendInvitationEmail(data) {
        const inviteLink = `${process.env.BETTER_AUTH_URL}/invite/${data.id}`;
        if (!resend) {
          console.log(`[DEV] Invite email for ${data.email}: ${inviteLink}`);
          return;
        }
        await resend.emails.send({
          from: "AccessAudit <onboarding@resend.dev>",
          to: data.email,
          subject: `${data.inviter.user.name} invited you to ${data.organization.name} on AccessAudit`,
          html: `
            <h2>You've been invited!</h2>
            <p>${data.inviter.user.name} has invited you to join <strong>${data.organization.name}</strong> on AccessAudit as a <strong>${data.role}</strong>.</p>
            <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
              Accept Invitation
            </a>
          `,
        });
      },
    }),
    dodopayments({
      client: dodoClient,
      createCustomerOnSignUp: true,
      use: [
        checkout({
          products: [
            { productId: process.env.DODO_PRODUCT_STARTER!, slug: "starter" },
            { productId: process.env.DODO_PRODUCT_AGENCY!, slug: "agency" },
            { productId: process.env.DODO_PRODUCT_PRO!, slug: "pro" },
          ],
          successUrl: "/settings?tab=billing&status=success",
          authenticatedUsersOnly: true,
        }),
        portal(),
        webhooks({
          webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY!,
          onSubscriptionActive: (payload) =>
            handleDodoWebhook("subscription.active", payload),
          onSubscriptionOnHold: (payload) =>
            handleDodoWebhook("subscription.on_hold", payload),
          onSubscriptionCancelled: (payload) =>
            handleDodoWebhook("subscription.cancelled", payload),
          onSubscriptionPlanChanged: (payload) =>
            handleDodoWebhook("subscription.plan_changed", payload),
          onSubscriptionRenewed: (payload) =>
            handleDodoWebhook("subscription.renewed", payload),
          onSubscriptionExpired: (payload) =>
            handleDodoWebhook("subscription.expired", payload),
          onSubscriptionFailed: (payload) =>
            handleDodoWebhook("subscription.failed", payload),
        }),
      ],
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
});

export type Session = typeof auth.$Infer.Session;
