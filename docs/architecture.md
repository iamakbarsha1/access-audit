# AccessAudit - Architecture

## Final Tech Stack

| Layer | Tool | Why |
|-------|------|-----|
| Frontend | Next.js 15 (App Router) | SSR for SEO, React ecosystem |
| API | tRPC | Type-safe, batched requests, best for SaaS dashboards |
| Auth | Better-Auth (orgs + RBAC) | Free, self-hosted, no MAU costs |
| Database | Neon PostgreSQL + Drizzle ORM | Relational data, type-safe, free tier |
| Queue | BullMQ + Upstash Redis | Managed Redis, free tier, reliable job processing |
| Scanner | Puppeteer + axe-core | Industry standard, zero false positives |
| AI Layer | Claude Haiku 4.5 | Cheapest Claude, fast for fix suggestions |
| App Hosting | Vercel | Free tier, best Next.js DX |
| Scanner Hosting | Railway | $5-20/mo, handles Puppeteer/headless Chrome well |
| Billing | Dodo Payments (MoR) | Indian founder friendly, handles global tax, FIRA/eBRC |
| Email | Resend | Free 3k emails/mo |
| White-label | Subdomain routing in Next.js | agency-name.accessaudit.com |

## Project Structure
- **Monorepo**: Turborepo + pnpm
- `apps/web` — Next.js 15 App Router (Vercel)
- `apps/scanner` — Puppeteer + axe-core worker (Railway)
- `packages/db` — Drizzle schema + migrations + client (shared)
- `packages/ui` — shadcn/ui + Tailwind components (shared)
- `packages/config` — Shared TypeScript, ESLint, Tailwind configs

## Architecture Pattern
- **Approach 2**: Next.js Full-Stack + Separate Scanner Service
- Next.js on Vercel = frontend + API routes + tRPC
- Scanner microservice on Railway = Puppeteer + axe-core + Claude API + BullMQ worker
- Connected via Upstash Redis queue

## Phase 1 Decisions
- **UI Library**: shadcn/ui + Tailwind CSS (copy-paste components, full control)
- **Package Manager**: pnpm (fastest, strictest for monorepos)
- **Auth Sessions**: Database sessions in PostgreSQL (instant revocation, audit trail)
- **Onboarding**: Org-first signup with 3-step wizard (branding → add site → first scan)
- **Team Invites**: Email magic links via Resend (MVP, shareable links later)
- **Logo Storage**: Vercel Blob (free 256MB tier)
- **Full spec**: `docs/superpowers/specs/2026-04-23-phase1-foundation-design.md`

## Monthly Running Cost (MVP)
| Service | Cost |
|---------|------|
| Vercel | $0 (free) |
| Neon PostgreSQL | $0 (free) |
| Upstash Redis | $0 (free) |
| Railway (scanner) | ~$5-20 |
| Claude Haiku API | ~$5-15 |
| Resend | $0 (free) |
| Better-Auth | $0 (self-hosted) |
| Domain | ~$12/year |
| **Total** | **~$10-35/month** |

## Why NOT Other Choices
- **Clerk**: $825/mo at 50K MAU — margin killer
- **MongoDB**: Data is relational (orgs→users→sites→scans→violations), Postgres fits better
- **Stripe**: Invite-only in India, ~6% fees, no FIRA/eBRC, you handle tax compliance
- **Serverless (Lambda)**: Puppeteer on Lambda is painful, cold starts, overkill for MVP
- **MERN Monolith**: Scanner and API share resources, harder to scale independently

## Evolution Path
- MVP: axe-core scanning + Claude Haiku for fix suggestions only (Option A)
- Post-MRR: Claude API deep analysis for full page scanning (Option B) — competitive moat
