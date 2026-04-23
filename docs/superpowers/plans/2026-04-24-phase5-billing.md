# Phase 5: Dodo Payments Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Dodo Payments billing with Better-Auth plugin — plans config, checkout, webhooks, plan enforcement middleware, billing UI, pricing page, and email notifications.

**Architecture:** Better-Auth Dodo plugin handles customer creation, checkout sessions, customer portal, and webhook verification. A `plans.ts` config defines tier quotas. A `paidProcedure` middleware gates write operations behind active plan/trial checks. Webhook events update `organizationSettings` and trigger Resend emails.

**Tech Stack:** `@dodopayments/better-auth`, `dodopayments` SDK, Better-Auth, tRPC, Drizzle ORM, Resend, Next.js 15 App Router, shadcn/ui

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/db/src/plans.ts` | Type-safe plan definitions (quotas, features, slugs) |
| `apps/web/src/lib/billing/webhook-handler.ts` | Dodo webhook event → DB update + email dispatch |
| `apps/web/src/lib/billing/emails.ts` | Email sending helpers for billing events |
| `apps/web/src/components/billing/billing-tab.tsx` | Compact billing info for settings page |
| `apps/web/src/app/pricing/page.tsx` | Public/authenticated pricing page with tier cards |
| `apps/web/src/app/api/cron/trial-nudge/route.ts` | Daily cron: send trial-expiring emails |

### Modified Files
| File | Change |
|------|--------|
| `apps/web/package.json` | Add `@dodopayments/better-auth`, `dodopayments` |
| `apps/web/src/lib/auth.ts` | Add Dodo plugin (checkout, portal, webhooks) |
| `apps/web/src/lib/auth-client.ts` | Add `dodopaymentsClient()` plugin |
| `apps/web/src/trpc/middleware.ts` | Add `paidProcedure` middleware |
| `apps/web/src/trpc/routers/sites.ts` | Use plans config for quota, add `paidProcedure` |
| `apps/web/src/trpc/routers/scans.ts` | Add `paidProcedure` to `startScan` |
| `apps/web/src/trpc/routers/members.ts` | Add team member quota check to `invite` |
| `apps/web/src/app/(dashboard)/settings/page.tsx` | Replace billing placeholder with `BillingTab` |
| `apps/web/src/app/(auth)/signup/page.tsx` | Create `organizationSettings` on signup |
| `.env.example` | Add Dodo env vars |
| `packages/db/src/index.ts` | Export `plans.ts` |

---

### Task 1: Plans Config

**Files:**
- Create: `packages/db/src/plans.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Create the plans config file**

```typescript
// packages/db/src/plans.ts
export const PLAN_KEYS = ["trial", "starter", "agency", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanFeatures {
  aiFixSuggestions: boolean;
  pdfReports: "basic" | "branded" | "branded_vpat";
  clientDashboard: boolean;
  complianceBadge: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
}

export interface PlanConfig {
  key: PlanKey;
  name: string;
  price: number; // cents per month
  dodoSlug: string; // slug used in Better-Auth checkout config
  siteQuota: number; // -1 means unlimited
  pagesPerSite: number;
  scanFrequency: "weekly" | "daily" | "hourly";
  teamMembers: number;
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  trial: {
    key: "trial",
    name: "Trial",
    price: 0,
    dodoSlug: "",
    siteQuota: 25,
    pagesPerSite: 50,
    scanFrequency: "daily",
    teamMembers: 5,
    features: {
      aiFixSuggestions: true,
      pdfReports: "branded",
      clientDashboard: true,
      complianceBadge: true,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  starter: {
    key: "starter",
    name: "Starter",
    price: 4900,
    dodoSlug: "starter",
    siteQuota: 3,
    pagesPerSite: 25,
    scanFrequency: "weekly",
    teamMembers: 1,
    features: {
      aiFixSuggestions: true,
      pdfReports: "basic",
      clientDashboard: false,
      complianceBadge: false,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  agency: {
    key: "agency",
    name: "Agency",
    price: 19900,
    dodoSlug: "agency",
    siteQuota: 25,
    pagesPerSite: 50,
    scanFrequency: "daily",
    teamMembers: 5,
    features: {
      aiFixSuggestions: true,
      pdfReports: "branded",
      clientDashboard: true,
      complianceBadge: true,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    price: 49900,
    dodoSlug: "pro",
    siteQuota: -1,
    pagesPerSite: 200,
    scanFrequency: "hourly",
    teamMembers: 15,
    features: {
      aiFixSuggestions: true,
      pdfReports: "branded_vpat",
      clientDashboard: true,
      complianceBadge: true,
      apiAccess: true,
      whiteLabel: true,
    },
  },
};

export function getPlan(key: string): PlanConfig {
  if (key in PLANS) return PLANS[key as PlanKey];
  return PLANS.trial;
}

export function isTrialExpired(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return true;
  return new Date() > trialEndsAt;
}

export function isPaidPlan(key: string): boolean {
  return key === "starter" || key === "agency" || key === "pro";
}
```

- [ ] **Step 2: Export from packages/db/src/index.ts**

Add this line to the existing exports in `packages/db/src/index.ts`:

```typescript
export * from "./plans";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/plans.ts packages/db/src/index.ts
git commit -m "feat(db): add plans config with tier definitions and helpers"
```

---

### Task 2: Install Dodo Packages & Environment Variables

**Files:**
- Modify: `apps/web/package.json`
- Modify: `.env.example`

- [ ] **Step 1: Install Dodo packages**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
pnpm add -F @access-audit/web @dodopayments/better-auth dodopayments
```

- [ ] **Step 2: Update .env.example with Dodo variables**

Add these lines to the end of `.env.example`:

```env
# Dodo Payments (Phase 5)
DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_WEBHOOK_KEY=
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PRODUCT_STARTER=
DODO_PRODUCT_AGENCY=
DODO_PRODUCT_PRO=
# Cron jobs
CRON_SECRET=
```

- [ ] **Step 3: Verify install succeeded**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml .env.example
git commit -m "feat(web): add Dodo Payments packages and env vars"
```

---

### Task 3: Better-Auth Dodo Plugin Integration

**Files:**
- Modify: `apps/web/src/lib/auth.ts`
- Modify: `apps/web/src/lib/auth-client.ts`

**Dependencies:** Task 2 (packages installed)

- [ ] **Step 1: Add Dodo plugin to auth.ts**

Read `apps/web/src/lib/auth.ts` first. Then modify it to add the Dodo plugin. Add imports at the top:

```typescript
import {
  dodopayments,
  checkout,
  portal,
  webhooks,
} from "@dodopayments/better-auth";
import DodoPayments from "dodopayments";
import { handleDodoWebhook } from "@/lib/billing/webhook-handler";
```

Add the Dodo client instance after the `resend` declaration:

```typescript
const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") ?? "test_mode",
});
```

Add the Dodo plugin to the `plugins` array (after the existing `organization()` plugin):

```typescript
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
      onSubscriptionActive: (payload) => handleDodoWebhook("subscription.active", payload),
      onSubscriptionOnHold: (payload) => handleDodoWebhook("subscription.on_hold", payload),
      onSubscriptionCancelled: (payload) => handleDodoWebhook("subscription.cancelled", payload),
      onSubscriptionPlanChanged: (payload) => handleDodoWebhook("subscription.plan_changed", payload),
      onSubscriptionRenewed: (payload) => handleDodoWebhook("subscription.renewed", payload),
      onSubscriptionExpired: (payload) => handleDodoWebhook("subscription.expired", payload),
      onSubscriptionFailed: (payload) => handleDodoWebhook("subscription.failed", payload),
    }),
  ],
}),
```

- [ ] **Step 2: Add dodopaymentsClient to auth-client.ts**

Read `apps/web/src/lib/auth-client.ts` first. Add import:

```typescript
import { dodopaymentsClient } from "@dodopayments/better-auth";
```

Add to the `plugins` array:

```typescript
plugins: [organizationClient(), dodopaymentsClient()],
```

- [ ] **Step 3: Create stub webhook handler so TypeScript compiles**

Create `apps/web/src/lib/billing/webhook-handler.ts` with a minimal stub:

```typescript
export async function handleDodoWebhook(
  eventType: string,
  payload: unknown
): Promise<void> {
  console.log(`[Dodo Webhook] ${eventType}`, payload);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors. If there are type errors from the Dodo package, check the exact import paths and adjust.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth.ts apps/web/src/lib/auth-client.ts apps/web/src/lib/billing/webhook-handler.ts
git commit -m "feat(auth): integrate Dodo Payments Better-Auth plugin"
```

---

### Task 4: Webhook Handler Implementation

**Files:**
- Modify: `apps/web/src/lib/billing/webhook-handler.ts`
- Create: `apps/web/src/lib/billing/emails.ts`

**Dependencies:** Task 1 (plans config), Task 3 (stub exists)

- [ ] **Step 1: Create billing email helpers**

```typescript
// apps/web/src/lib/billing/emails.ts
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
```

- [ ] **Step 2: Implement the full webhook handler**

Replace the stub in `apps/web/src/lib/billing/webhook-handler.ts`:

```typescript
// apps/web/src/lib/billing/webhook-handler.ts
import { db } from "@access-audit/db/client";
import { organizationSettings } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import { getPlan, type PlanKey, PLANS } from "@access-audit/db/plans";
import {
  sendSubscriptionActiveEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from "./emails";
import { user, member } from "@access-audit/db/schema";

async function findOrgByDodoCustomerId(
  customerId: string
): Promise<{ orgId: string; ownerEmail: string } | null> {
  // Find the org settings row that has this Dodo customer ID
  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.dodoCustomerId, customerId));

  if (settings[0]) {
    const ownerEmail = await getOrgOwnerEmail(settings[0].organizationId);
    return { orgId: settings[0].organizationId, ownerEmail };
  }

  return null;
}

async function getOrgOwnerEmail(orgId: string): Promise<string> {
  const members = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  // Find owner, fallback to first member
  const ownerMember = await db
    .select({ email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  const owner = ownerMember.find((m) => m.role === "owner");
  return owner?.email ?? ownerMember[0]?.email ?? "";
}

function resolveProductToPlan(productId: string): PlanKey {
  // Match product ID from env vars to plan key
  if (productId === process.env.DODO_PRODUCT_STARTER) return "starter";
  if (productId === process.env.DODO_PRODUCT_AGENCY) return "agency";
  if (productId === process.env.DODO_PRODUCT_PRO) return "pro";
  return "trial";
}

export async function handleDodoWebhook(
  eventType: string,
  payload: any
): Promise<void> {
  const data = payload?.data ?? payload;
  const customerId = data?.customer_id ?? data?.customerId;
  const subscriptionId = data?.subscription_id ?? data?.subscriptionId;
  const productId = data?.product_id ?? data?.productId;

  if (!customerId) {
    console.error(`[Dodo Webhook] No customer_id in ${eventType}`, payload);
    return;
  }

  const org = await findOrgByDodoCustomerId(customerId);
  if (!org) {
    console.error(
      `[Dodo Webhook] No org found for customer ${customerId}`,
      eventType
    );
    return;
  }

  switch (eventType) {
    case "subscription.active": {
      const planKey = resolveProductToPlan(productId);
      const plan = getPlan(planKey);
      await db
        .update(organizationSettings)
        .set({
          plan: planKey,
          dodoSubscriptionId: subscriptionId,
          siteQuota: plan.siteQuota === -1 ? 999999 : plan.siteQuota,
          scanQuota: plan.pagesPerSite,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));

      await sendSubscriptionActiveEmail(org.ownerEmail, plan.name);
      break;
    }

    case "subscription.on_hold": {
      // Payment failed — set to trial (read-only enforcement)
      await db
        .update(organizationSettings)
        .set({
          plan: "trial",
          // Keep dodoSubscriptionId so we can reactivate
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));

      const portalUrl = `${process.env.BETTER_AUTH_URL}/api/auth/dodopayments/portal?customer_id=${customerId}`;
      await sendPaymentFailedEmail(org.ownerEmail, portalUrl);
      break;
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      await db
        .update(organizationSettings)
        .set({
          plan: "trial",
          dodoSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));

      await sendSubscriptionCancelledEmail(org.ownerEmail);
      break;
    }

    case "subscription.plan_changed": {
      const planKey = resolveProductToPlan(productId);
      const plan = getPlan(planKey);
      await db
        .update(organizationSettings)
        .set({
          plan: planKey,
          siteQuota: plan.siteQuota === -1 ? 999999 : plan.siteQuota,
          scanQuota: plan.pagesPerSite,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));
      break;
    }

    case "subscription.renewed": {
      // No DB change needed — plan stays the same
      console.log(`[Dodo Webhook] Subscription renewed for org ${org.orgId}`);
      break;
    }

    case "subscription.failed": {
      // Subscription creation failed
      console.error(
        `[Dodo Webhook] Subscription creation failed for org ${org.orgId}`,
        data
      );
      break;
    }

    default:
      console.log(`[Dodo Webhook] Unhandled event: ${eventType}`);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/billing/webhook-handler.ts apps/web/src/lib/billing/emails.ts
git commit -m "feat(billing): webhook handler with subscription lifecycle and email notifications"
```

---

### Task 5: paidProcedure Middleware

**Files:**
- Modify: `apps/web/src/trpc/middleware.ts`

**Dependencies:** Task 1 (plans config)

- [ ] **Step 1: Read the current middleware file**

Read `apps/web/src/trpc/middleware.ts` to see the exact current code.

- [ ] **Step 2: Add paidProcedure middleware**

Add imports at the top of `apps/web/src/trpc/middleware.ts`:

```typescript
import { organizationSettings } from "@access-audit/db/schema";
import { isPaidPlan, isTrialExpired } from "@access-audit/db/plans";
```

Add the `paidProcedure` function after the existing `orgProcedure` function:

```typescript
export function paidProcedure(minRole: Role = "viewer") {
  return orgProcedure(minRole).use(async ({ ctx, next }) => {
    const settings = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.orgId));

    const orgSettings = settings[0];
    const plan = orgSettings?.plan ?? "trial";

    // Paid plans always pass
    if (isPaidPlan(plan)) {
      return next({ ctx: { ...ctx, plan, orgSettings } });
    }

    // Trial plan — check if still valid
    if (!isTrialExpired(orgSettings?.trialEndsAt ?? null)) {
      return next({ ctx: { ...ctx, plan, orgSettings } });
    }

    // Trial expired, no paid plan → block
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your trial has expired. Please upgrade to continue.",
    });
  });
}
```

- [ ] **Step 3: Export the Role type for use in other files**

The `Role` type is already defined in the file as `type Role = keyof typeof ROLE_HIERARCHY`. Make sure it's exported:

```typescript
export type Role = keyof typeof ROLE_HIERARCHY;
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/trpc/middleware.ts
git commit -m "feat(trpc): add paidProcedure middleware for plan/trial enforcement"
```

---

### Task 6: Enforce Plan Quotas in Routes

**Files:**
- Modify: `apps/web/src/trpc/routers/sites.ts`
- Modify: `apps/web/src/trpc/routers/scans.ts`
- Modify: `apps/web/src/trpc/routers/members.ts`

**Dependencies:** Task 5 (paidProcedure)

- [ ] **Step 1: Update sites.ts — use paidProcedure and plans config for site quota**

Read `apps/web/src/trpc/routers/sites.ts`. Change the `add` mutation:

1. Change import: replace `orgProcedure` with both `orgProcedure` and `paidProcedure` from `"../middleware"`.
2. Add import: `import { getPlan } from "@access-audit/db/plans";`
3. Change the `add` route from `orgProcedure("member")` to `paidProcedure("member")`.
4. Replace the quota check block (lines 30-53) with:

```typescript
    .mutation(async ({ ctx, input }) => {
      // Quota from plans config (paidProcedure puts plan in ctx)
      const planConfig = getPlan(ctx.plan);
      const quota = planConfig.siteQuota;

      // Unlimited check
      if (quota !== -1) {
        const [siteCount] = await ctx.db
          .select({ count: count() })
          .from(sites)
          .where(
            and(
              eq(sites.organizationId, ctx.orgId),
              eq(sites.status, "active")
            )
          );

        if ((siteCount?.count ?? 0) >= quota) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Site limit reached (${quota}). Upgrade your plan for more sites.`,
          });
        }
      }

      // ... rest of the mutation unchanged (duplicate check + insert)
```

5. Remove the `organizationSettings` import from sites.ts since quota now comes from plans config.

- [ ] **Step 2: Update scans.ts — add paidProcedure to startScan**

Read `apps/web/src/trpc/routers/scans.ts`. Changes:

1. Add import: `import { paidProcedure } from "../middleware";`
2. Change `startScan` from `orgProcedure("member")` to `paidProcedure("member")`.
3. No quota check needed for scans in MVP — the `paidProcedure` middleware handles the "is plan active?" gate.

- [ ] **Step 3: Update members.ts — add team member quota to invite**

Read `apps/web/src/trpc/routers/members.ts`. Changes:

1. Add imports:
```typescript
import { paidProcedure } from "../middleware";
import { getPlan } from "@access-audit/db/plans";
import { count } from "@access-audit/db";
```

2. Change `invite` from `orgProcedure("admin")` to `paidProcedure("admin")`.

3. Add quota check at the start of the `invite` mutation body, before the existing `auth.api.createInvitation` call:

```typescript
    .mutation(async ({ ctx, input }) => {
      // Check team member quota
      const planConfig = getPlan(ctx.plan);
      const [memberCount] = await ctx.db
        .select({ count: count() })
        .from(member)
        .where(eq(member.organizationId, ctx.orgId));

      if ((memberCount?.count ?? 0) >= planConfig.teamMembers) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Team member limit reached (${planConfig.teamMembers}). Upgrade your plan for more members.`,
        });
      }

      // ... existing createInvitation call unchanged
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/trpc/routers/sites.ts apps/web/src/trpc/routers/scans.ts apps/web/src/trpc/routers/members.ts
git commit -m "feat(trpc): enforce plan quotas in sites, scans, and members routes"
```

---

### Task 7: Fix organizationSettings Initialization on Signup

**Files:**
- Modify: `apps/web/src/app/(auth)/signup/page.tsx`

**Dependencies:** None (can run in parallel with Tasks 1-6)

- [ ] **Step 1: Read the signup page**

Read `apps/web/src/app/(auth)/signup/page.tsx` to see the current org creation flow.

- [ ] **Step 2: Add organizationSettings creation after org creation**

After the organization is created and set as active (after `authClient.organization.setActive()`), add a tRPC mutation call or direct DB insert to create the settings row. Since this is a client component, the cleanest approach is to add a tRPC mutation.

Add a new route to the organization router. First, read `apps/web/src/trpc/routers/organization.ts`. Add a new mutation:

```typescript
  initSettings: authedProcedure.mutation(async ({ ctx }) => {
    const orgId = ctx.session.session.activeOrganizationId;
    if (!orgId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active organization",
      });
    }

    // Check if settings already exist
    const existing = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, orgId));

    if (existing[0]) return existing[0];

    // Create with trial defaults
    const inserted = await ctx.db
      .insert(organizationSettings)
      .values({
        organizationId: orgId,
        plan: "trial",
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        siteQuota: 25,
        scanQuota: 50,
      })
      .returning();

    return inserted[0];
  }),
```

Import `authedProcedure` at the top of `organization.ts`:

```typescript
import { orgProcedure, authedProcedure } from "../middleware";
```

- [ ] **Step 3: Call initSettings from the signup page**

In `apps/web/src/app/(auth)/signup/page.tsx`, after the `authClient.organization.setActive()` call, add:

```typescript
// Initialize organization settings with trial
try {
  const trpcClient = (await import("@/trpc/client")).trpc;
  // We can't use hooks here since this is in an event handler.
  // Instead, use a fetch call to the tRPC endpoint.
} catch (e) {
  console.error("Failed to init settings:", e);
}
```

Actually, a simpler approach: call `initSettings` from the onboarding page's `useEffect` instead, since the user always goes through onboarding after signup. Read `apps/web/src/app/(dashboard)/onboarding/page.tsx`.

In the onboarding page, add at the start of the component (before the existing queries):

```typescript
const initSettings = trpc.organization.initSettings.useMutation();

useEffect(() => {
  initSettings.mutate();
}, []);
```

This is idempotent (checks for existing settings first), so it's safe to call every time onboarding loads.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/trpc/routers/organization.ts apps/web/src/app/\(dashboard\)/onboarding/page.tsx
git commit -m "feat(billing): initialize organizationSettings with trial on onboarding"
```

---

### Task 8: Billing Tab Component

**Files:**
- Create: `apps/web/src/components/billing/billing-tab.tsx`
- Modify: `apps/web/src/app/(dashboard)/settings/page.tsx`

**Dependencies:** Task 1 (plans config)

- [ ] **Step 1: Create the BillingTab component**

```typescript
// apps/web/src/components/billing/billing-tab.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { getPlan, isPaidPlan, isTrialExpired } from "@access-audit/db/plans";
import { ExternalLink } from "lucide-react";

export function BillingTab() {
  const orgQuery = trpc.organization.getOrg.useQuery();
  const settings = orgQuery.data?.settings;
  const planKey = settings?.plan ?? "trial";
  const plan = getPlan(planKey);
  const trialEndsAt = settings?.trialEndsAt
    ? new Date(settings.trialEndsAt)
    : null;
  const paid = isPaidPlan(planKey);
  const trialExpired = !paid && isTrialExpired(trialEndsAt);

  const daysLeft = trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  async function handleManageBilling() {
    const { data, error } =
      await authClient.dodopayments.customer.portal();
    if (data?.url) {
      window.location.href = data.url;
    }
  }

  return (
    <div className="space-y-4">
      {/* Plan Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Current Plan
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-semibold">{plan.name}</span>
                {paid && (
                  <span className="text-sm text-muted-foreground">
                    ${(plan.price / 100).toFixed(0)}/mo
                  </span>
                )}
                {!paid && !trialExpired && (
                  <Badge variant="secondary">
                    Trial &middot; {daysLeft} day{daysLeft !== 1 ? "s" : ""}{" "}
                    left
                  </Badge>
                )}
                {trialExpired && (
                  <Badge variant="destructive">Trial expired</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <a href="/pricing?upgrade=true">Change Plan</a>
              </Button>
              {paid && (
                <Button variant="outline" onClick={handleManageBilling}>
                  Manage Billing
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Sites</p>
            <p className="mt-1 text-2xl font-semibold">
              {orgQuery.data?.settings?.siteQuota !== undefined
                ? `— / ${plan.siteQuota === -1 ? "∞" : plan.siteQuota}`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Team Members</p>
            <p className="mt-1 text-2xl font-semibold">
              — / {plan.teamMembers}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Pages per Site</p>
            <p className="mt-1 text-2xl font-semibold">
              {plan.pagesPerSite}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace billing tab placeholder in settings page**

Read `apps/web/src/app/(dashboard)/settings/page.tsx`. Replace the billing TabsContent (lines 111-120):

Add import at the top:

```typescript
import { BillingTab } from "@/components/billing/billing-tab";
```

Replace the billing `TabsContent`:

```typescript
        <TabsContent value="billing" className="pt-4">
          <BillingTab />
        </TabsContent>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/billing/billing-tab.tsx apps/web/src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat(billing): add compact billing tab to settings page"
```

---

### Task 9: Pricing Page

**Files:**
- Create: `apps/web/src/app/pricing/page.tsx`

**Dependencies:** Task 1 (plans config), Task 3 (auth-client with dodopaymentsClient)

- [ ] **Step 1: Create the pricing page**

```typescript
// apps/web/src/app/pricing/page.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { PLANS, type PlanKey } from "@access-audit/db/plans";
import { toast } from "sonner";
import { useState } from "react";

const DISPLAY_PLANS: PlanKey[] = ["starter", "agency", "pro"];

const FEATURE_ROWS = [
  { label: "AI fix suggestions", key: "aiFixSuggestions" },
  { label: "Client dashboard", key: "clientDashboard" },
  { label: "Compliance badge", key: "complianceBadge" },
  { label: "API access", key: "apiAccess" },
  { label: "White-label", key: "whiteLabel" },
] as const;

export default function PricingPage() {
  const searchParams = useSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "true";
  const { data: session } = useSession();
  const orgQuery = trpc.organization.getOrg.useQuery(undefined, {
    enabled: !!session,
  });
  const currentPlan = orgQuery.data?.settings?.plan ?? "trial";
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelectPlan(slug: string) {
    if (!session) {
      // Not logged in — redirect to signup
      window.location.href = "/signup";
      return;
    }

    setLoading(slug);
    try {
      const { data, error } =
        await authClient.dodopayments.checkoutSession({
          slug,
        });

      if (error) {
        toast.error("Failed to start checkout. Please try again.");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold">
          {isUpgrade ? "Choose Your Plan" : "Simple, Transparent Pricing"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isUpgrade
            ? "Select the plan that fits your needs."
            : "Start with a 7-day free trial. No credit card required."}
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {DISPLAY_PLANS.map((key) => {
          const plan = PLANS[key];
          const isCurrent = currentPlan === key;
          const isPopular = key === "agency";

          return (
            <Card
              key={key}
              className={`relative ${
                isPopular
                  ? "border-2 border-primary shadow-lg"
                  : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold">
                    ${(plan.price / 100).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.siteQuota === -1
                      ? "Unlimited sites"
                      : `Up to ${plan.siteQuota} sites`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.pagesPerSite} pages per site
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.scanFrequency.charAt(0).toUpperCase() +
                      plan.scanFrequency.slice(1)}{" "}
                    scans
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.teamMembers} team member
                    {plan.teamMembers > 1 ? "s" : ""}
                  </li>
                  {FEATURE_ROWS.map((feat) => (
                    <li key={feat.key} className="flex items-center gap-2">
                      {plan.features[feat.key] ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40" />
                      )}
                      <span
                        className={
                          !plan.features[feat.key]
                            ? "text-muted-foreground/60"
                            : ""
                        }
                      >
                        {feat.label}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    {plan.features.pdfReports === "basic" ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : plan.features.pdfReports === "branded" ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                    {plan.features.pdfReports === "basic"
                      ? "Basic PDF reports"
                      : plan.features.pdfReports === "branded"
                        ? "Branded PDF reports"
                        : "Branded + VPAT reports"}
                  </li>
                </ul>

                {isCurrent ? (
                  <Button className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : session ? (
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan.dodoSlug)}
                    disabled={loading === plan.dodoSlug}
                  >
                    {loading === plan.dodoSlug
                      ? "Redirecting..."
                      : isCurrent
                        ? "Current Plan"
                        : `${isUpgrade ? "Switch to" : "Get"} ${plan.name}`}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    asChild
                  >
                    <a href="/signup">Start Free Trial</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/pricing/page.tsx
git commit -m "feat(billing): add dual-purpose pricing page with checkout integration"
```

---

### Task 10: Trial Nudge Cron Job

**Files:**
- Create: `apps/web/src/app/api/cron/trial-nudge/route.ts`

**Dependencies:** Task 4 (email helpers)

- [ ] **Step 1: Create the cron route handler**

```typescript
// apps/web/src/app/api/cron/trial-nudge/route.ts
import { NextResponse } from "next/server";
import { db } from "@access-audit/db/client";
import { organizationSettings } from "@access-audit/db/schema";
import { member, user } from "@access-audit/db/schema";
import { eq, and, sql } from "@access-audit/db";
import { sendTrialExpiringEmail } from "@/lib/billing/emails";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  // Find orgs on trial expiring in 1-2 days
  const expiringOrgs = await db
    .select({
      organizationId: organizationSettings.organizationId,
      trialEndsAt: organizationSettings.trialEndsAt,
    })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.plan, "trial"),
        sql`${organizationSettings.trialEndsAt} > ${oneDayFromNow}`,
        sql`${organizationSettings.trialEndsAt} <= ${twoDaysFromNow}`
      )
    );

  let sent = 0;
  for (const org of expiringOrgs) {
    // Find owner email
    const ownerResult = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.organizationId, org.organizationId),
          eq(member.role, "owner")
        )
      );

    const ownerEmail = ownerResult[0]?.email;
    if (!ownerEmail) continue;

    const daysLeft = Math.ceil(
      (org.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    await sendTrialExpiringEmail(ownerEmail, daysLeft);
    sent++;
  }

  return NextResponse.json({ sent, checked: expiringOrgs.length });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/cron/trial-nudge/route.ts
git commit -m "feat(billing): add trial-nudge cron job for expiring trial emails"
```

---

### Task 11: Store Dodo Customer ID on Org Settings

**Files:**
- Modify: `apps/web/src/trpc/routers/organization.ts`

**Dependencies:** Task 7 (initSettings exists)

The Better-Auth Dodo plugin creates a Dodo customer on signup (`createCustomerOnSignUp: true`), but we need the `dodoCustomerId` stored in `organizationSettings` so webhooks can resolve which org a subscription belongs to.

- [ ] **Step 1: Add a mutation to store the Dodo customer ID**

Read `apps/web/src/trpc/routers/organization.ts`. Add a new mutation:

```typescript
  linkDodoCustomer: orgProcedure("owner")
    .input(z.object({ dodoCustomerId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(organizationSettings)
        .set({
          dodoCustomerId: input.dodoCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, ctx.orgId))
        .returning();

      return updated[0];
    }),
```

- [ ] **Step 2: Add a query to get the Dodo customer ID from the auth session**

The Better-Auth Dodo plugin stores the customer ID on the user. Add a query that exposes this so the client can call `linkDodoCustomer` after signup:

```typescript
  getDodoCustomerId: authedProcedure.query(async ({ ctx }) => {
    // The Dodo plugin stores customer_id on the user record
    // Access it via the session user metadata
    const userRecord = await ctx.db
      .select()
      .from(user)
      .where(eq(user.id, ctx.user.id));

    // The dodo customer ID may be stored in user metadata or a separate table
    // depending on how @dodopayments/better-auth implements createCustomerOnSignUp
    return { userId: ctx.user.id };
  }),
```

Note: The exact field where `@dodopayments/better-auth` stores the customer ID depends on the package implementation. During implementation, check the Better-Auth Dodo plugin's database schema — it may add a `dodoCustomerId` field to the user table or create a separate mapping table. Adjust the query accordingly.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit`
Expected: Clean exit, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/trpc/routers/organization.ts
git commit -m "feat(billing): add linkDodoCustomer mutation for webhook resolution"
```

---

### Task 12: Final Verification & Phase Close-Out

**Files:**
- Modify: `docs/phases.md`

**Dependencies:** All previous tasks

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit && pnpm tsc --noEmit
```
Expected: Clean exit, zero errors.

- [ ] **Step 2: Verify all new files exist**

Check that all created files are present:
- `packages/db/src/plans.ts`
- `apps/web/src/lib/billing/webhook-handler.ts`
- `apps/web/src/lib/billing/emails.ts`
- `apps/web/src/components/billing/billing-tab.tsx`
- `apps/web/src/app/pricing/page.tsx`
- `apps/web/src/app/api/cron/trial-nudge/route.ts`

- [ ] **Step 3: Verify key modifications**

Spot-check these files to confirm changes landed correctly:
- `apps/web/src/lib/auth.ts` — Dodo plugin present
- `apps/web/src/lib/auth-client.ts` — `dodopaymentsClient()` in plugins
- `apps/web/src/trpc/middleware.ts` — `paidProcedure` exported
- `apps/web/src/trpc/routers/sites.ts` — uses `paidProcedure` and `getPlan`
- `apps/web/src/trpc/routers/scans.ts` — `startScan` uses `paidProcedure`
- `apps/web/src/trpc/routers/members.ts` — `invite` has team member quota
- `apps/web/src/app/(dashboard)/settings/page.tsx` — `BillingTab` imported

- [ ] **Step 4: Update phases.md**

Read `docs/phases.md`. Update Phase 5 status from "Not Started" to "Complete":

```markdown
| 5 | Billing (Dodo Payments) | Complete | Gate revenue — needed before launch but not before dev |
```

- [ ] **Step 5: Commit docs update**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 5 Billing as complete"
```
