# Phase 5: Dodo Payments Billing Integration — Design Spec

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration approach | Better-Auth plugin (`@dodopayments/better-auth`) | Already using Better-Auth; auto customer creation, unified webhook/checkout routes |
| Trial flow | No CC, 7-day Agency trial, track `trialEndsAt` ourselves | Maximizes signups for a zero-trust brand |
| Expired/lapsed behavior | Read-only mode (view data, can't act) | Sunk cost motivates upgrade; hard lockout loses users |
| Plan enforcement | Hybrid: middleware for plan status, per-route for quotas | Clean separation of "can they act?" vs "can they do this specific thing?" |
| Billing tab UI | Compact: plan info + usage stats + manage buttons | Dodo portal handles invoices/cards; less to build |
| Change Plan flow | Dedicated `/pricing` page | Reusable for Phase 8 landing page |
| Product mapping | Hardcoded `plans.ts` config + env vars for Dodo product IDs | 3 static tiers don't need database flexibility |
| Webhook sync | DB updates + email notifications via Resend | Silent churn prevention; trial nudge drives conversion |

---

## 1. Plans Config (`packages/db/src/plans.ts`)

Type-safe plan definitions. Dodo product IDs come from env vars (different between test/live).

```typescript
export const PLAN_KEYS = ["trial", "starter", "agency", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanConfig {
  key: PlanKey;
  name: string;
  price: number; // cents/month
  dodoProductSlug: string;
  siteQuota: number; // -1 = unlimited
  pagesPerSite: number;
  scanFrequency: "weekly" | "daily" | "hourly";
  teamMembers: number;
  features: {
    aiFixSuggestions: boolean;
    pdfReports: "basic" | "branded" | "branded_vpat";
    clientDashboard: boolean;
    complianceBadge: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
  };
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  trial: {
    key: "trial",
    name: "Trial",
    price: 0,
    dodoProductSlug: "",
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
  starter: { ... }, // 3 sites, 25 pages, weekly, 1 member, $49
  agency: { ... },  // 25 sites, 50 pages, daily, 5 members, $199
  pro: { ... },     // unlimited sites, 200 pages, hourly, 15 members, $499
};

export function getPlan(key: PlanKey): PlanConfig { return PLANS[key]; }
export function isActivePlan(plan: PlanKey): boolean { return plan !== "trial"; }
```

Trial tier mirrors Agency features for the 7-day trial period.

---

## 2. Better-Auth Dodo Plugin Integration

### Server (`apps/web/src/lib/auth.ts`)

Add the Dodo plugin to existing Better-Auth config:

```typescript
import { dodopayments, checkout, portal, webhooks } from "@dodopayments/better-auth";
import DodoPayments from "dodopayments";

const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode",
});

// Inside betterAuth({ plugins: [...] }):
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
      onPayload: async (payload) => { /* route to webhook handler */ },
      onSubscriptionActive: async (payload) => { /* handle activation */ },
      onSubscriptionOnHold: async (payload) => { /* handle payment failure */ },
      onSubscriptionCancelled: async (payload) => { /* handle cancellation */ },
      onSubscriptionPlanChanged: async (payload) => { /* handle plan change */ },
      onSubscriptionRenewed: async (payload) => { /* handle renewal */ },
      onSubscriptionExpired: async (payload) => { /* handle expiration */ },
    }),
  ],
}),
```

### Client (`apps/web/src/lib/auth-client.ts`)

```typescript
import { dodopaymentsClient } from "@dodopayments/better-auth";

// Add to createAuthClient plugins:
dodopaymentsClient()
```

### Environment Variables

```env
DODO_PAYMENTS_API_KEY=         # API key from Dodo dashboard
DODO_PAYMENTS_WEBHOOK_KEY=     # Webhook secret from Dodo dashboard
DODO_PAYMENTS_ENVIRONMENT=test_mode  # test_mode or live_mode
DODO_PRODUCT_STARTER=pdt_xxx   # Dodo product ID for Starter tier
DODO_PRODUCT_AGENCY=pdt_yyy    # Dodo product ID for Agency tier
DODO_PRODUCT_PRO=pdt_zzz       # Dodo product ID for Pro tier
```

---

## 3. Webhook Handler

Handles Dodo subscription lifecycle events. Updates `organizationSettings` and sends emails.

### Event → Action Mapping

| Webhook Event | DB Update | Email |
|---------------|-----------|-------|
| `subscription.active` | Set `plan` to matching tier, store `dodoSubscriptionId` | "Welcome to [Plan]!" |
| `subscription.on_hold` | Set `plan` to `"trial"` (read-only enforcement) | "Payment failed — update your card" with portal link |
| `subscription.cancelled` | Set `plan` to `"trial"`, clear `dodoSubscriptionId` | "Your subscription has been cancelled" |
| `subscription.plan_changed` | Update `plan` to new tier | "Plan changed to [New Plan]" |
| `subscription.renewed` | No change needed (plan stays same) | None |
| `subscription.expired` | Set `plan` to `"trial"`, clear `dodoSubscriptionId` | "Your subscription has expired" |

### Customer-to-Org Resolution

The webhook payload contains a Dodo `customer_id`. We need to resolve this to an organization:
- `createCustomerOnSignUp: true` stores the Dodo customer ID on the Better-Auth user
- We look up the user by Dodo customer ID → find their org memberships → update the org's settings
- Edge case: user belongs to multiple orgs → use the org that has the matching `dodoCustomerId` in `organizationSettings`

### Implementation

The webhook handler will be a standalone function (`apps/web/src/lib/billing/webhook-handler.ts`) called from the Better-Auth plugin's event handlers. This keeps billing logic isolated from auth config.

---

## 4. Plan Status Middleware (`paidProcedure`)

New tRPC middleware that checks whether the org has an active plan or valid trial.

```typescript
// Wraps orgProcedure — adds plan status check
export const paidProcedure = (minRole: Role) =>
  orgProcedure(minRole).use(async ({ ctx, next }) => {
    const settings = await db.query.organizationSettings.findFirst({
      where: eq(organizationSettings.organizationId, ctx.orgId),
    });

    const plan = settings?.plan ?? "trial";
    const trialEndsAt = settings?.trialEndsAt;

    // Check: is this org on an active paid plan?
    if (plan !== "trial") return next({ ctx: { ...ctx, plan, settings } });

    // Check: is the trial still valid?
    if (trialEndsAt && new Date() < trialEndsAt) {
      return next({ ctx: { ...ctx, plan: "trial" as const, settings } });
    }

    // Trial expired, no paid plan → block write operations
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your trial has expired. Please upgrade to continue.",
    });
  });
```

### Route enforcement

| Route | Middleware | Additional Quota Check |
|-------|-----------|----------------------|
| `sites.add` | `paidProcedure("member")` | Site count vs `PLANS[plan].siteQuota` |
| `scans.trigger` | `paidProcedure("member")` | Scan frequency vs `PLANS[plan].scanFrequency` |
| `organization.inviteMember` | `paidProcedure("admin")` | Member count vs `PLANS[plan].teamMembers` |
| `sites.list`, `scans.list`, `violations.list` | `orgProcedure("viewer")` | None (read-only always allowed) |
| `dashboard.stats` | `orgProcedure("viewer")` | None (read-only) |

---

## 5. Billing Tab UI (`settings/billing-tab.tsx`)

Compact layout with:

1. **Plan info card**: Current plan name + price, renewal date (or "Trial expires in X days")
2. **Usage stats row**: Sites used / quota, Team members / quota, Pages per site limit
3. **Action buttons**: "Change Plan" (links to `/pricing?upgrade=true`), "Manage Billing" (opens Dodo customer portal)
4. **Trial state**: When on trial, show trial-specific messaging: "You're on a free trial. X days remaining."
5. **Lapsed state**: When expired/on_hold, show warning styling + "Reactivate" button

Data source: `organization.getOrg` tRPC query (already returns settings).

---

## 6. Pricing Page (`/pricing`)

Dual-purpose page — works for both authenticated and unauthenticated users.

### Layout
- 3 pricing tier cards side by side (Starter / Agency / Pro)
- Feature comparison table below
- If authenticated: current plan highlighted, upgrade/downgrade buttons
- If unauthenticated: "Start Free Trial" CTA on all cards

### Upgrade flow
1. User clicks "Upgrade to Agency" on the pricing page
2. Client calls `authClient.dodopayments.checkoutSession({ slug: "agency" })`
3. Redirects to Dodo hosted checkout (Dodo handles payment UI, tax, compliance)
4. On success → redirects to `/settings?tab=billing&status=success`
5. Webhook fires → updates `organizationSettings.plan` to `"agency"`

### Downgrade flow
1. User clicks "Downgrade to Starter"
2. Confirmation dialog: "You'll lose access to features X, Y, Z at the end of your billing cycle"
3. Calls Dodo API to change subscription plan (proration: `difference_immediately`)
4. Webhook `subscription.plan_changed` → updates plan in DB

---

## 7. Email Notifications

Four email templates using Resend (already set up):

| Email | Trigger | Content |
|-------|---------|---------|
| `subscription-active.tsx` | `subscription.active` webhook | Welcome, plan name, what's included, dashboard link |
| `payment-failed.tsx` | `subscription.on_hold` webhook | Payment failed, update card CTA (Dodo portal link) |
| `subscription-cancelled.tsx` | `subscription.cancelled` webhook | Cancellation confirmed, data retained, reactivation link |
| `trial-expiring.tsx` | Scheduled check (day 5 of trial) | 2 days left, upgrade CTA, what they'll lose |

### Trial expiry email trigger
- Option: tRPC route called by a Vercel Cron job (`/api/cron/trial-nudge`) running daily
- Queries orgs where `plan = 'trial'` AND `trialEndsAt` is 2 days from now
- Sends `trial-expiring` email to org owner

---

## 8. Schema Changes

Minimal changes to existing `organizationSettings`:

```typescript
// packages/db/src/schema/organizations.ts
// Change plan column default and add type safety:
plan: text("plan").default("trial").notNull(),
// Values: "trial" | "starter" | "agency" | "pro"

// Existing columns already sufficient:
// dodoCustomerId, dodoSubscriptionId, trialEndsAt, siteQuota, scanQuota
```

`siteQuota` and `scanQuota` columns become redundant since quotas are derived from `PLANS[plan]` config. However, keeping them allows per-org overrides (e.g., custom enterprise deal). For MVP, the webhook handler will update both `plan` AND the quota columns to stay in sync.

---

## 9. Trial Initialization

When an organization is created (signup flow), ensure `organizationSettings` is initialized with:
- `plan: "trial"`
- `trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)` (7 days from now)
- `siteQuota: 25` (Agency-tier quota during trial)
- `scanQuota: 50`

This may already happen in the onboarding flow — verify and fix if not.

---

## Scope Boundaries

**In scope (Phase 5):**
- Better-Auth Dodo plugin setup
- Plans config file
- Webhook handler for subscription events
- `paidProcedure` middleware
- Billing tab (compact)
- Pricing page (dual-purpose)
- 4 email templates
- Trial initialization fix
- Quota enforcement updates (sites, scans, team members)
- Trial nudge cron job

**Out of scope:**
- In-app banners for payment status (polish pass)
- Annual billing toggle (post-launch)
- Custom enterprise plans
- Invoice history UI (Dodo portal handles this)
- Coupon/discount codes
