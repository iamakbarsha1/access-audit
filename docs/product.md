# AccessAudit - Product Design

## Pricing Tiers

| Feature | Starter $49/mo | Agency $199/mo | Pro $499/mo |
|---------|----------------|----------------|-------------|
| Sites | Up to 3 | Up to 25 | Unlimited |
| Pages/site | 25 | 50 | 200 |
| Scan frequency | Weekly | Daily | Hourly |
| Team members | 1 | 5 | 15 |
| AI fix suggestions | Yes | Yes | Yes |
| PDF reports | Basic | Branded | Branded + VPAT |
| Client dashboard | No | White-label | White-label |
| Compliance badge | No | Yes | Yes |
| API access | No | No | Yes |
| Priority support | No | No | Yes |
| CI/CD plugin | No | No | Yes (post-launch) |

- **Free trial**: 7 days on Agency plan, no credit card required

## MVP Features (Weeks 1-8)

### Core Scanning
- URL scanner (single page)
- Site crawler (up to 50 pages per site)
- WCAG 2.1 AA compliance check (axe-core)
- Scheduled scans (daily/weekly/monthly)
- Scan history with trend tracking

### AI-Powered Fixes
- Plain-English violation explanations (Claude Haiku)
- Copy-paste fix code for each violation
- Priority ranking (critical to minor)
- "Fix impact" score

### Agency Dashboard
- Multi-site management
- Organization with team member invites (RBAC)
- Compliance score per site (0-100%)
- Bulk scan (scan all sites at once)
- Alert emails on compliance score drops

### Client Deliverables
- PDF compliance report (branded with agency logo)
- Shareable client dashboard (read-only link)
- Compliance badge/certificate (embeddable)
- Before/after comparison reports

### Billing
- 3 pricing tiers via Dodo Payments
- Subscription management
- Usage tracking
- Free trial (7 days, no CC)

## Post-Launch Features

### Phase 2 (Competitive Moat - after MRR)
- Claude API deep analysis (Option B upgrade)
- Auto-fix PRs (connect GitHub repo, Claude generates PR)
- VPAT document generation
- CI/CD integration (GitHub Action / npm package)
- API access for Pro tier

### Phase 3 (Expansion)
- Starter tier marketing (SEO, content)
- Browser extension (quick scan any page)
- Slack/Teams notifications
- WordPress/Shopify plugins
- Competitor comparison reports

## Data Model (PostgreSQL + Drizzle)

### Tables
- **organizations**: id, name, slug, logo_url, brand_color, plan, dodo_customer_id
- **users**: id, email, name, avatar_url
- **org_members**: org_id, user_id, role (owner|admin|member|viewer)
- **sites**: id, org_id, url, name, scan_frequency, last_scan_id, compliance_score, status
- **scans**: id, site_id, triggered_by, status, pages_crawled, compliance_score, violation counts by severity, duration_ms
- **violations**: id, scan_id, page_url, rule_id, impact, wcag_tags, description, html_snippet, selector, ai_explanation, ai_fix_code, status
- **reports**: id, scan_id, site_id, org_id, format, storage_url, share_token, expires_at

## Key User Flows
1. **Agency Signup & First Scan**: Landing → Sign Up → Create Org → Add Site → Scan → Dashboard with score + violations → AI fix suggestions
2. **Bulk Scan & Client Report**: Dashboard → Select all → Scan All → BullMQ queues jobs → PDF report with agency branding
3. **Monitoring & Alerts**: Scheduled scan → Detect regression → Email alert → Owner sees diff of new issues
