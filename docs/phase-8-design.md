# Phase 8: Landing Page + Launch Prep — Design Spec

## Overview

Final phase before product launch. Four workstreams: a conversion-focused landing page, privacy-first visitor analytics with daily email digest, SEO/meta infrastructure, and error page polish.

Visual direction: **Gradient & Bold** — subtle background gradients, blue-to-purple accent palette, energetic but professional.

## 1. Landing Page

### Page Structure (top to bottom)

1. **Navbar** — Sticky, transparent-to-solid on scroll. Logo (left), nav links: Features, Pricing, FAQ (center-anchors to sections), Sign In link + "Start Free Trial" CTA button (right). Mobile: hamburger menu.

2. **Hero** — Bold headline with gradient text (blue-to-purple). Subheadline targeting agencies. Two CTAs: "Start Free Trial" (primary gradient button) and "See How It Works" (outline, scrolls to How It Works section). Below: stylized dashboard preview mockup (CSS illustration or screenshot, not an image dependency).

3. **Urgency Stats Bar** — 3 stat blocks in a row, subtle background:
   - "95.9%" — of websites are non-compliant (source: WebAIM Million 2025)
   - "37%" — surge in ADA lawsuits in H1 2025
   - "April 2026" — ADA Title II compliance deadline

4. **Features Grid** — 2x3 grid, each card with icon + title + 1-2 sentence description:
   - AI Fix Suggestions — "Get copy-paste code fixes for every violation, powered by Claude AI."
   - WCAG 2.1 AA Scanning — "Industry-standard axe-core engine scans up to 200 pages per site."
   - Branded PDF Reports — "Deliver professional compliance reports with your agency's logo and colors."
   - White-Label Dashboard — "Give clients their own branded portal at your-agency.accessaudit.com."
   - Compliance Badges — "Embed dynamic SVG badges that prove your clients' sites are compliant."
   - Team Management — "Invite your team with role-based access: owner, admin, member, viewer."

5. **How It Works** — 3 numbered steps with connecting visual (line or arrows):
   - Step 1: "Add Your Site" — Enter a URL, we crawl and discover pages automatically.
   - Step 2: "We Scan & Analyze" — axe-core checks every page, Claude AI generates fix code.
   - Step 3: "Deliver to Clients" — PDF reports, branded dashboards, compliance badges — ready to share.

6. **Pricing** — Shared `PricingCards` component rendered inline. Full 3-tier comparison with feature rows and checkout CTAs. Extracted from existing `/pricing/page.tsx` into a reusable component.

7. **FAQ** — Accordion (shadcn Accordion component), 7 questions:
   - "How accurate is the scanning?" — axe-core is the industry standard used by Deque, Google, Microsoft. Zero false-positive design goal.
   - "Does this make my site ADA compliant?" — We identify violations and provide fix code. Compliance requires implementing the fixes. We're a tool, not a legal guarantee.
   - "What WCAG standards do you test?" — WCAG 2.1 Level AA, the standard referenced by ADA Title II.
   - "Is there a free trial?" — 7 days on the Agency plan, no credit card required.
   - "How does white-label work?" — Agency and Pro plans get a branded subdomain (your-name.accessaudit.com) with your logo and colors.
   - "Is my data secure?" — All data encrypted in transit and at rest. Hosted on Vercel (SOC 2) and Neon PostgreSQL. We never store raw visitor IPs.
   - "Can I cancel anytime?" — Yes, cancel from your billing settings. No contracts, no cancellation fees.

8. **Final CTA** — Full-width gradient background banner. Headline: "Ready to make your clients' sites compliant?" Subtext: "Start your free 7-day trial. No credit card required." Single CTA button.

9. **Footer** — 4 columns:
   - Column 1: Logo + tagline "Built with accessibility in mind"
   - Column 2: Product — Features, Pricing, FAQ
   - Column 3: Legal — Privacy Policy, Terms of Service
   - Column 4: Connect — Twitter/X, GitHub (if applicable)
   - Bottom bar: "© 2026 AccessAudit. All rights reserved."

### Shared Components

- `components/marketing/marketing-nav.tsx` — Sticky navbar with transparent-to-solid scroll effect. Used in `(marketing)/layout.tsx`.
- `components/marketing/marketing-footer.tsx` — Footer with link columns. Used in `(marketing)/layout.tsx`.
- `components/marketing/pricing-cards.tsx` — Extracted from `/pricing/page.tsx`. Accepts optional `showHeader` prop (true on /pricing, false when embedded in landing page). Contains plan cards, feature rows, and checkout logic.
- `components/marketing/faq-accordion.tsx` — FAQ data + shadcn Accordion. Used on landing page.

### Visual Style

- Background: subtle radial gradient `#fafafa → #f0f4ff`
- Accent: blue-to-purple gradient `#3b82f6 → #8b5cf6` on CTAs, headline text, decorative elements
- Cards: white with subtle border, slight shadow on hover
- Typography: system font stack (Inter if available), bold headlines, muted body text
- Section spacing: generous `py-20` to `py-24` per section
- Animations: subtle fade-in on scroll for each section (CSS `@keyframes` + Intersection Observer, no heavy libraries)

## 2. Visitor Analytics

### Database Schema

**page_views** (raw data, retained 90 days):
```
id          serial primary key
path        text not null          -- e.g., "/", "/pricing"
visitor_hash text not null         -- SHA-256(IP + daily_salt)
referrer    text                   -- nullable, where they came from
user_agent  text                   -- nullable, for aggregate device stats
created_at  timestamp default now()
```

Index: `(created_at)` for cron range queries, `(path, created_at)` for per-page analytics.

**page_views_daily** (aggregated, permanent):
```
id               serial primary key
path             text not null
date             date not null
views            integer not null
unique_visitors  integer not null
top_referrer     text              -- nullable
created_at       timestamp default now()
```

Unique constraint: `(path, date)` — one row per page per day.

### Privacy Design

- **No cookies, no localStorage, no fingerprinting**
- IP hashed server-side with daily rotating salt: `SHA-256(IP + CRON_SECRET + YYYY-MM-DD)`
- Same IP gets different hash each day — no cross-day tracking
- Raw IPs never stored, never logged
- `user_agent` stored for aggregate device/browser stats only, not for fingerprinting
- No consent banner required (no personal data stored per GDPR standards)

### Tracking Flow

1. `TrackPageview` client component mounts on marketing pages
2. Fires `navigator.sendBeacon('POST /api/track', { path, referrer })` — non-blocking, fire-and-forget
3. Falls back to `fetch` if sendBeacon unavailable
4. One request per page load, deduplicated by visitor_hash + path + 1-hour window (prevents refresh spam)
5. API route: extracts IP from `x-forwarded-for` header, hashes server-side, inserts row, returns 204

### Daily Digest Email

- **Trigger**: `POST /api/cron/analytics` — called by external cron (same pattern as scan cron)
- **Auth**: Validates `CRON_SECRET` header
- **Aggregation**: Queries page_views from last 24 hours
- **Before sending**: Rolls up yesterday's raw data into `page_views_daily` (idempotent upsert)
- **Email via Resend** to `ANALYTICS_ADMIN_EMAIL`:
  - Subject: "AccessAudit Daily Analytics — {date}"
  - Body: Total page views, unique visitors, top 5 pages, top 3 referrers, day-over-day change (↑12% / ↓5%)
  - Clean HTML, minimal styling, mobile-friendly

### Data Retention

- Raw `page_views`: purged after 90 days by the daily analytics cron
- Aggregated `page_views_daily`: permanent — never deleted
- Purge flow: aggregate → verify row exists in page_views_daily → delete raw rows older than 90 days

## 3. SEO & Meta

### Root Layout Metadata

```typescript
export const metadata: Metadata = {
  title: {
    default: "AccessAudit — ADA Accessibility Compliance for Agencies",
    template: "%s | AccessAudit",
  },
  description: "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients.",
  keywords: ["ADA compliance", "WCAG", "accessibility", "web accessibility audit", "agency tools"],
  openGraph: {
    type: "website",
    siteName: "AccessAudit",
    // ... dynamic OG image
  },
  twitter: {
    card: "summary_large_image",
  },
};
```

### Dynamic OG Image

`apps/web/src/app/opengraph-image.tsx` — uses Next.js `ImageResponse` to generate a 1200x630 OG image with:
- AccessAudit logo/wordmark
- Tagline: "ADA Accessibility Made Simple"
- Blue-to-purple gradient background matching brand

### Sitemap

`apps/web/src/app/sitemap.ts` — returns entries for:
- `/` (landing page) — priority 1.0, changeFrequency weekly
- `/pricing` — priority 0.8
- `/login`, `/signup` — priority 0.5

### Robots.txt

`apps/web/src/app/robots.ts`:
- Allow all crawlers on public pages
- Disallow `/dashboard`, `/sites`, `/settings`, `/api`, `/wl`
- Sitemap URL included

### JSON-LD Structured Data

On landing page, inject `SoftwareApplication` schema:
- name: "AccessAudit"
- applicationCategory: "BusinessApplication"
- operatingSystem: "Web"
- offers: 3 tiers with prices

## 4. Error Pages & Polish

### Custom 404 Page

`apps/web/src/app/not-found.tsx`:
- Gradient background matching brand
- Large "404" with gradient text
- "Page not found" message
- "Go back home" button linking to `/`
- Friendly, on-brand tone

### Custom Error Page

`apps/web/src/app/error.tsx`:
- "use client" (required for error boundaries)
- "Something went wrong" message
- "Try again" button (calls `reset()`)
- "Go home" fallback link
- Same gradient styling as 404

### Favicon

`apps/web/src/app/icon.tsx` — Next.js generated favicon using `ImageResponse`:
- Simple checkmark in a rounded square
- Blue-to-purple gradient matching brand
- Sizes: 32x32, 192x192 (for PWA)

### Marketing Layout Refactor

Replace current bare `(marketing)/layout.tsx` with:
- `MarketingNav` component (sticky, scroll-aware)
- `{children}`
- `MarketingFooter` component
- `TrackPageview` component (analytics tracking)

## 5. Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `ANALYTICS_ADMIN_EMAIL` | Daily digest recipient | Yes (for analytics) |
| `CRON_SECRET` | Auth for cron endpoints | Already exists |
| `RESEND_API_KEY` | Email sending | Already exists |

## 6. File Manifest

### New Files
- `apps/web/src/components/marketing/marketing-nav.tsx`
- `apps/web/src/components/marketing/marketing-footer.tsx`
- `apps/web/src/components/marketing/pricing-cards.tsx`
- `apps/web/src/components/marketing/faq-accordion.tsx`
- `apps/web/src/components/marketing/track-pageview.tsx`
- `apps/web/src/app/api/track/route.ts`
- `apps/web/src/app/api/cron/analytics/route.ts`
- `apps/web/src/app/opengraph-image.tsx`
- `apps/web/src/app/sitemap.ts`
- `apps/web/src/app/robots.ts`
- `apps/web/src/app/not-found.tsx`
- `apps/web/src/app/error.tsx`
- `apps/web/src/app/icon.tsx`
- `packages/db/src/schema/pageViews.ts`

### Modified Files
- `apps/web/src/app/(marketing)/layout.tsx` — use MarketingNav + MarketingFooter + TrackPageview
- `apps/web/src/app/(marketing)/page.tsx` — full landing page rewrite
- `apps/web/src/app/pricing/page.tsx` — extract PricingCards, use shared component
- `apps/web/src/app/layout.tsx` — add root metadata, JSON-LD
- `packages/db/src/schema/index.ts` — export pageViews schema
- `packages/db/src/index.ts` — export new tables
- `.env.example` — add ANALYTICS_ADMIN_EMAIL
