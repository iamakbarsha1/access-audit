import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@access-audit/db/client";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

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
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    async sendVerificationEmail({ user, url }) {
      if (!resend) {
        console.log(`[DEV] Verification email for ${user.email}: ${url}`);
        return;
      }
      await resend.emails.send({
        from: "AccessAudit <noreply@accessaudit.com>",
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
          from: "AccessAudit <noreply@accessaudit.com>",
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
