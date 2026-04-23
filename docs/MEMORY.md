# AccessAudit - Project Memory

## Project Overview
ADA Accessibility Compliance SaaS for agencies/SMBs. Scan websites for WCAG violations, generate AI-powered fix suggestions, provide branded compliance reports.

- **Working name**: AccessAudit
- **Owner**: Akbarsha (MERN stack dev, 4.5+ years exp, based in India)
- **Target launch**: 6-8 weeks from project start (April 2026)
- **Beachhead customer**: Web agencies/freelancers managing 10-50+ client sites

## Key Decisions (Locked In)
- See [architecture.md](./architecture.md) for full tech stack
- See [product.md](./product.md) for features, pricing, data model
- See [strategy.md](./strategy.md) for business strategy and roadmap
- See [phases.md](./phases.md) for 8-phase build order and dependencies

## Workflow Rules
- **Keep all copies in sync**: When changing anything, ALWAYS update ALL places where that content exists (memory files, project docs/, code, configs). Never update one and leave the other stale.

## Critical Reminders
- **MVP uses Option A** (axe-core + Puppeteer, Claude only for fix suggestions) ~$10-35/mo
- **Post-MRR switch to Option B** (Claude API heavy analysis) to become market leader
- Dodo Payments chosen over Stripe (Indian founder, MoR handles tax compliance)
- Better-Auth over Clerk (free, no MAU costs at scale)
- PostgreSQL (Neon) over MongoDB (relational data model fits better)
