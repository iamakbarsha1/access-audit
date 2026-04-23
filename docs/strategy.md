# AccessAudit - Business Strategy

## Market Opportunity
- ADA Title II deadline: April 24, 2026 (government entities must comply)
- ADA Title II next wave: April 26, 2027
- EU Accessibility Act: kicked in June 2025
- 95.9% of websites are non-compliant
- Accessibility lawsuits surged 37% in H1 2025
- Market size: $1.75B+
- Only 4 affordable competitors (UserWay, accessiBe use overlays that don't actually work)

## Go-to-Market Strategy
- **Beachhead**: Agencies/freelancers (1 sale = 10-50 sites)
- **Then expand to**: SMBs (Starter tier) and Mid-market SaaS (Pro tier)
- **Distribution**: Reddit, IndieHackers, Twitter/X, agency Slack communities
- No SEO or paid ads needed initially

## Competitive Advantages
1. Real scanning (axe-core) vs overlay hacks (accessiBe/UserWay)
2. AI-powered fix suggestions (no competitor has this)
3. Agency white-label (underserved niche)
4. Affordable ($49-499/mo vs $5,000+/yr for Deque/Level Access)
5. Post-MRR: Claude deep analysis as competitive moat

## Timeline (Target: 6-8 weeks)
- Week 1: Project setup + Better-Auth + Neon DB + Drizzle schema
- Week 2: Dodo Payments integration + subscription management
- Week 3: Scanner service (Puppeteer + axe-core + BullMQ)
- Week 4: Claude AI fix suggestions + violation reporting
- Week 5: Agency dashboard (site management, bulk scans, charts)
- Week 6: White-label client views + PDF reports
- Week 7: Landing page + marketing site + polish
- Week 8: Testing, bug fixes, launch prep
- Weeks 1-2 can compress with Claude Max parallelization

## Revenue Projections
- At 100 Agency customers ($199/mo): ~$19,900/mo gross
- After Dodo fees (~3.5-4%): ~$19,100/mo net
- Running costs at that scale: ~$100-200/mo
- Potential profit: ~$18,900/mo

## Key Principle
- Start narrow (agencies), expand later
- Don't build 3 products — build 1 product with 3 pricing tiers unlocked over time
