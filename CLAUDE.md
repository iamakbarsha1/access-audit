# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AccessAudit — ADA Accessibility Compliance SaaS targeting web agencies/freelancers. Scans websites for WCAG violations using axe-core, generates AI-powered fix suggestions via Claude Haiku, and provides branded compliance reports.

## Architecture

Two-service architecture:

1. **Next.js App** (Vercel) — frontend + tRPC API routes + Better-Auth + Dodo Payments billing
2. **Scanner Service** (Railway) — Puppeteer + axe-core + Claude Haiku API + BullMQ worker

Connected via Upstash Redis (BullMQ queue).

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **API**: tRPC (type-safe, batched requests). Use Server Actions only for simple one-off form mutations.
- **Auth**: Better-Auth with organizations plugin (RBAC: owner/admin/member/viewer). NOT Clerk.
- **Database**: Neon PostgreSQL with Drizzle ORM. NOT MongoDB.
- **Queue**: BullMQ + Upstash Redis
- **Scanner**: Puppeteer + axe-core (industry standard WCAG testing)
- **AI**: Claude Haiku 4.5 via Anthropic SDK — for fix suggestions and violation explanations only (Option A). Post-MRR: upgrade to full Claude API analysis (Option B).
- **Billing**: Dodo Payments (Merchant of Record). NOT Stripe (invite-only in India, high fees, no FIRA/eBRC).
- **Email**: Resend
- **Hosting**: Vercel (app), Railway (scanner service)

## Key Design Decisions

- Owner is based in India — all payment/tax decisions reflect this (Dodo Payments as MoR handles global tax compliance)
- Better-Auth over Clerk to avoid per-MAU pricing that kills margins at scale
- PostgreSQL over MongoDB because data is relational (orgs → users → sites → scans → violations)
- Scanner runs as separate service because Puppeteer/headless Chrome needs its own process and memory
- White-label via subdomain routing: `agency-name.accessaudit.com`

## Planning Documents

All product specs, data models, pricing, and strategy are in `docs/`:
- `docs/architecture.md` — full tech stack, costs, architecture pattern
- `docs/product.md` — features, pricing tiers, data model, user flows
- `docs/strategy.md` — market opportunity, timeline, revenue projections
- `docs/MEMORY.md` — project overview and critical reminders

Always consult these before making architectural decisions. Update them when decisions change.

## Sync Rule

Content exists in both `docs/` and Claude's memory directory. When updating any planning content, ALWAYS update both locations.
