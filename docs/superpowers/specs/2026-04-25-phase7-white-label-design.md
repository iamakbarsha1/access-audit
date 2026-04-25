# Phase 7: White-Label Subdomain Routing — Design Spec

## Overview

White-label subdomain routing allows Agency and Pro tier agencies to serve branded client-facing pages under `{org-slug}.accessaudit.com`. Clients see the agency's logo, brand color, and org name — not AccessAudit branding. Agency team members continue to manage everything at `accessaudit.com`.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Plan gating | Agency + Pro (both tiers) |
| 2 | Subdomain source | Existing `org.slug` field — no new DB fields |
| 3 | What lives on subdomain | Client-facing dashboard only (read-only) |
| 4 | Content structure | Branded landing page at root + share token links for reports |
| 5 | Branding depth | Moderate — logo, brandColor, derived page title, "Powered by AccessAudit" footer |
| 6 | Routing strategy | Middleware rewrite to `(white-label)` route group |

## Architecture

### Request Flow

```
Client browser: acme-digital.accessaudit.com/r/abc123
        |
        v
DNS: *.accessaudit.com → Vercel (wildcard domain, auto SSL)
        |
        v
Next.js Middleware:
  1. Extract subdomain from Host header
  2. If no subdomain or subdomain is "www" → pass through to main app
  3. Look up org by slug (DB query with caching)
  4. Validate org exists AND has whiteLabel feature enabled
  5. If invalid → redirect to accessaudit.com
  6. Rewrite URL: /r/abc123 → /wl/acme-digital/r/abc123
        |
        v
(white-label) route group:
  - Layout fetches org branding (logo, brandColor, name)
  - Renders branded shell around content
        |
        v
Page renders with agency branding
```

### URL Mapping

| Client sees | Next.js serves (internal) | Purpose |
|---|---|---|
| `acme-digital.accessaudit.com/` | `/wl/acme-digital` | Branded landing page |
| `acme-digital.accessaudit.com/r/[shareToken]` | `/wl/acme-digital/r/[shareToken]` | Branded share report |
| `acme-digital.accessaudit.com/badge/[siteId]` | `/wl/acme-digital/badge/[siteId]` | Compliance badge via subdomain |

## Components

### 1. Middleware Update (`apps/web/src/middleware.ts`)

The middleware runs before any page render. Updated logic:

```
1. Extract hostname from request
2. Parse subdomain (everything before first dot, excluding "www")
3. If subdomain exists:
   a. Check org exists with this slug (lightweight DB/cache lookup)
   b. Check org plan has whiteLabel: true
   c. If valid → rewrite to /wl/[slug]/[...path]
   d. If invalid slug → redirect to accessaudit.com with 302
   e. If valid slug but ineligible plan → redirect to accessaudit.com/pricing
4. If no subdomain → continue with existing auth/routing logic
```

Subdomain detection must handle:
- `localhost:3000` in development (no subdomain detection)
- `acme-digital.accessaudit.com` in production
- `www.accessaudit.com` (treat as no subdomain)
- Bare `accessaudit.com` (no subdomain)

For org lookup performance, the middleware should use a lightweight fetch to an internal API endpoint or direct DB query. Since middleware runs on the edge, a fetch to an internal `/api/wl/verify/[slug]` endpoint is the cleanest approach.

### 2. Org Verification Endpoint (`apps/web/src/app/api/wl/verify/[slug]/route.ts`)

Lightweight API route that middleware calls to validate a subdomain slug:

- Input: org slug from URL param
- Query: `organization` JOIN `organizationSettings` WHERE `slug = input`
- Response: `{ valid: boolean, orgId?: string, plan?: string }`
- Returns valid only if org exists AND plan has `whiteLabel: true`
- Should be fast — simple indexed lookup on `slug` (already unique)

### 3. White-Label Route Group (`apps/web/src/app/(white-label)/wl/[slug]/`)

New route group with its own layout, completely isolated from dashboard and marketing layouts.

**Layout** (`layout.tsx`):
- Receives `slug` from URL params
- Fetches org data: name, logo, brandColor
- Sets CSS custom property `--wl-brand-color` from org's brandColor
- Renders branded shell:
  - Header: org logo (falls back to org name text if no logo)
  - Content area: `{children}`
  - Footer: "Powered by AccessAudit" with link to accessaudit.com
- Sets dynamic metadata: `<title>{org.name} | Accessibility Report</title>`

**Landing page** (`page.tsx`):
- Simple branded page showing:
  - Org logo (large, centered)
  - Org name
  - Brief text: "Accessibility compliance reports"
  - "Powered by AccessAudit" in footer (from layout)
- No data exposed — purely branding

**Share report page** (`r/[shareToken]/page.tsx`):
- Validates share token against `reports` table
- Validates the report belongs to this org (slug matches)
- Reuses existing share page data fetching logic from `apps/web/src/app/share/[shareToken]/page.tsx`
- Renders within the white-label branded layout
- If token invalid or doesn't belong to org → 404 page

**Badge route** (`badge/[siteId]/route.ts`):
- Proxies to existing `/api/badge/[siteId]` endpoint
- Validates site belongs to the org matching the slug
- Returns same SVG badge response

### 4. Plan Gating Update (`packages/db/src/plans.ts`)

Change Agency plan's `whiteLabel` from `false` to `true`:

```typescript
agency: {
  features: {
    whiteLabel: true,  // was false
  }
}
```

Add helper function:

```typescript
export function canUseWhiteLabel(plan: string): boolean {
  return getPlan(plan).features.whiteLabel;
}
```

### 5. Dashboard Integration

**Organization settings page**: Show the white-label subdomain URL to eligible agencies. Display `{slug}.accessaudit.com` as a copyable link. For ineligible plans, show upgrade prompt.

**Share link generation**: When an agency on Agency/Pro plan generates a share link, the displayed URL should use their subdomain format (`{slug}.accessaudit.com/r/{token}`) instead of the main domain. The existing `/share/[token]` URLs continue to work as a fallback.

### 6. Vercel Configuration

- Add wildcard domain `*.accessaudit.com` to Vercel project
- Vercel handles SSL automatically for wildcard subdomains
- No code changes needed — purely a project settings configuration
- Document setup steps in deployment docs

## Data Flow

No new database tables or columns. Uses existing:

| Field | Table | Usage |
|---|---|---|
| `slug` | `organization` | Subdomain identifier (unique, indexed) |
| `logo` | `organization` | Header logo on branded pages |
| `name` | `organization` | Page title, landing page display |
| `brandColor` | `organizationSettings` | CSS accent color on branded pages |
| `plan` | `organizationSettings` | White-label eligibility check |

## Security

- **No auth on subdomains**: Client-facing pages are read-only. No session cookies, no login, no cross-domain auth complexity.
- **Share token validation**: Reports require a valid, non-expired share token. The token must also belong to the org matching the subdomain slug (prevents token leaking to wrong subdomain).
- **Org-site ownership**: Badge endpoint validates the site belongs to the org before serving.
- **Slug validation**: Middleware rejects unknown slugs early with a redirect, preventing probing.
- **Reserved slugs**: Prevent orgs from using slugs like `www`, `api`, `app`, `admin`, `mail`, `status` that could conflict with infrastructure.

## Development & Testing

- **Local dev**: Subdomain detection is skipped on `localhost`. Use query param `?wl=slug` or direct `/wl/[slug]/...` routes for local testing.
- **Reserved slug enforcement**: Add validation during org creation/slug update to reject reserved slugs.

## Not in Scope

- Custom domains (CNAME + SSL provisioning) — post-launch premium upsell
- Auth/login on subdomains — agencies manage everything on main domain
- New DB schema — all data exists already
- Subdomain management UI — slug set during onboarding, editable in org settings
- Email from subdomain — all transactional email comes from accessaudit.com
