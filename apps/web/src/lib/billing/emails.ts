import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "AccessAudit <noreply@accessaudit.com>";

async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) {
    console.log(`[DEV] Email to ${to}: ${subject}`);
    return;
  }
  await resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendSubscriptionActiveEmail(
  email: string,
  planName: string
) {
  await sendEmail(
    email,
    `Welcome to AccessAudit ${planName}!`,
    `
    <h2>Your ${planName} plan is active!</h2>
    <p>Thanks for subscribing to AccessAudit. Your ${planName} plan is now active and all features are unlocked.</p>
    <a href="${process.env.BETTER_AUTH_URL}/settings?tab=billing" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
      Go to Dashboard
    </a>
    `
  );
}

export async function sendPaymentFailedEmail(
  email: string,
  portalUrl: string
) {
  await sendEmail(
    email,
    "Action Required: Payment failed for your AccessAudit subscription",
    `
    <h2>Your payment failed</h2>
    <p>We weren't able to process your latest payment. Your account is now in read-only mode — you can still view your data, but scanning and other actions are paused.</p>
    <p>Please update your payment method to restore full access:</p>
    <a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
      Update Payment Method
    </a>
    `
  );
}

export async function sendSubscriptionCancelledEmail(email: string) {
  await sendEmail(
    email,
    "Your AccessAudit subscription has been cancelled",
    `
    <h2>Subscription cancelled</h2>
    <p>Your AccessAudit subscription has been cancelled. Your account is now in read-only mode — all your data is preserved and you can reactivate at any time.</p>
    <a href="${process.env.BETTER_AUTH_URL}/pricing" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
      Reactivate
    </a>
    `
  );
}

export async function sendTrialExpiringEmail(
  email: string,
  daysLeft: number
) {
  await sendEmail(
    email,
    `Your AccessAudit trial expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    `
    <h2>Your trial is ending soon</h2>
    <p>Your free trial expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. After that, your account will switch to read-only mode.</p>
    <p>Upgrade now to keep scanning, adding sites, and generating reports:</p>
    <a href="${process.env.BETTER_AUTH_URL}/pricing" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
      Choose a Plan
    </a>
    `
  );
}
