# Phase 1: Project Scaffolding + Auth + DB Schema — Design Spec

## Overview

Foundation phase for AccessAudit. Sets up the Turborepo monorepo, database schema, authentication with multi-tenancy, and the dashboard shell. Everything built in subsequent phases depends on this.

**Outcome**: A working app where an agency owner can sign up, create an org, set branding, add sites, invite team members, and navigate a dashboard shell — all backed by PostgreSQL with proper RBAC.

---

## 1. Monorepo Structure (Turborepo + pnpm)

```
access-audit/
├── apps/
│   ├── web/                          # Next.js 15 App Router → Vercel
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages
│   │   │   ├── components/           # App-specific components
│   │   │   ├── lib/                  # Auth client, tRPC client, utils
│   │   │   ├── server/               # tRPC routers, middleware, server-only
│   │   │   └── styles/               # Global styles, Tailwind
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── scanner/                      # Placeholder for Phase 2
│       ├── src/
│       │   └── index.ts              # Empty entry point
│       ├── Dockerfile
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   ├── db/                           # Drizzle schema + migrations + client
│   │   ├── src/
│   │   │   ├── schema/               # Table definitions
│   │   │   │   ├── auth.ts           # Better-Auth managed tables
│   │   │   │   ├── organizations.ts  # Org settings (custom)
│   │   │   │   ├── sites.ts          # Sites table (custom)
│   │   │   │   └── index.ts          # Re-exports all schemas
│   │   │   ├── client.ts             # Drizzle client + Neon connection
│   │   │   └── index.ts              # Package entry point
│   │   ├── drizzle.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── ui/                           # shadcn/ui shared components
│   │   ├── src/
│   │   │   └── components/           # Button, Input, Card, Dialog, etc.
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── config/                       # Shared configs
│       ├── typescript/               # Base tsconfig
│       ├── eslint/                   # ESLint config
│       └── tailwind/                 # Shared Tailwind preset
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
└── CLAUDE.md
```

### turbo.json pipelines

- `build` — builds all packages and apps (packages/db first, then packages/ui, then apps)
- `dev` — runs Next.js dev server + watches packages
- `lint` — ESLint across all packages
- `db:generate` — Drizzle schema generation
- `db:migrate` — Run migrations against Neon
- `db:push` — Push schema changes (dev only)

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 2. Database Schema

### Better-Auth Managed Tables

Better-Auth auto-creates and manages these. We define them in Drizzle for type safety but don't manually migrate them.

```
user
├── id (text, PK)
├── name (text)
├── email (text, unique)
├── emailVerified (boolean)
├── image (text, nullable)
├── createdAt (timestamp)
└── updatedAt (timestamp)

session
├── id (text, PK)
├── userId (text, FK → user.id)
├── token (text, unique)
├── expiresAt (timestamp)
├── ipAddress (text, nullable)
└── userAgent (text, nullable)

account
├── id (text, PK)
├── userId (text, FK → user.id)
├── accountId (text)
├── providerId (text)  — "credential" or "google"
├── accessToken (text, nullable)
├── refreshToken (text, nullable)
├── accessTokenExpiresAt (timestamp, nullable)
└── refreshTokenExpiresAt (timestamp, nullable)

verification
├── id (text, PK)
├── identifier (text)
├── value (text)
├── expiresAt (timestamp)
└── createdAt (timestamp)
```

### Better-Auth Organization Plugin Tables

Auto-created by the organization plugin. We define in Drizzle for types.

```
organization
├── id (text, PK)
├── name (text)
├── slug (text, unique)
├── logo (text, nullable)
├── metadata (text, nullable) — JSON string
├── createdAt (timestamp)
└── updatedAt (timestamp)

member
├── id (text, PK)
├── organizationId (text, FK → organization.id)
├── userId (text, FK → user.id)
├── role (text) — "owner" | "admin" | "member" | "viewer"
├── createdAt (timestamp)
└── updatedAt (timestamp)

invitation
├── id (text, PK)
├── organizationId (text, FK → organization.id)
├── email (text)
├── role (text)
├── status (text) — "pending" | "accepted" | "rejected" | "canceled"
├── inviterId (text, FK → user.id)
├── expiresAt (timestamp)
└── createdAt (timestamp)
```

### Custom Tables (We Own These)

```
organization_settings
├── id (uuid, PK, default gen_random_uuid())
├── organizationId (text, FK → organization.id, unique)
├── brandColor (text, default "#6366f1")
├── plan (text, default "trial") — "trial" | "starter" | "agency" | "pro"
├── dodoCustomerId (text, nullable)
├── dodoSubscriptionId (text, nullable)
├── trialEndsAt (timestamp) — set to NOW() + 7 days on creation
├── siteQuota (integer, default 25) — based on plan
├── scanQuota (integer, default 50) — pages per site based on plan
├── onboardingCompleted (boolean, default false)
├── createdAt (timestamp)
└── updatedAt (timestamp)

sites
├── id (uuid, PK, default gen_random_uuid())
├── organizationId (text, FK → organization.id)
├── url (text) — validated URL
├── name (text) — friendly label
├── scanFrequency (text, default "daily") — "manual" | "daily" | "weekly" | "monthly"
├── lastScanId (uuid, nullable, FK → scans.id) — added in Phase 2
├── complianceScore (integer, nullable) — 0-100, null until first scan
├── status (text, default "active") — "active" | "paused" | "archived"
├── createdAt (timestamp)
└── updatedAt (timestamp)

UNIQUE constraint: (organizationId, url) — no duplicate URLs per org
```

---

## 3. Authentication

### Better-Auth Configuration

- **Session strategy**: Database sessions (stored in `session` table)
- **Providers**: Email/password + Google OAuth
- **Plugins**: Organization (with RBAC roles: owner, admin, member, viewer)
- **Session cookie**: httpOnly, secure, sameSite=lax, 30-day expiry
- **Email verification**: Required before accessing dashboard (Resend transactional email)

### Auth Client Setup

```
packages/db          → Drizzle schema (shared)
apps/web/src/lib/
├── auth.ts          → Better-Auth server instance (uses Drizzle adapter)
├── auth-client.ts   → Better-Auth React client hooks
```

Better-Auth server instance configured with:
- Drizzle adapter pointing to Neon PostgreSQL
- Resend email plugin for verification + invite emails
- Organization plugin with custom roles

### RBAC Permissions

| Action | Owner | Admin | Member | Viewer |
|--------|-------|-------|--------|--------|
| Manage org settings/branding | Yes | Yes | No | No |
| Manage billing | Yes | No | No | No |
| Invite/remove members | Yes | Yes | No | No |
| Change member roles | Yes | Yes (except owner) | No | No |
| Add/edit/delete sites | Yes | Yes | Yes | No |
| View sites + scans | Yes | Yes | Yes | Yes |
| Run scans | Yes | Yes | Yes | No |
| Generate reports | Yes | Yes | Yes | Yes |

---

## 4. tRPC Setup

### Router Structure

```
apps/web/src/server/
├── trpc.ts                    # tRPC init, context creation
├── router.ts                  # Root appRouter merging all sub-routers
├── middleware/
│   ├── auth.ts                # enforceAuth — reject if no session
│   └── orgAccess.ts           # enforceOrgAccess(minRole) — check org membership + role
└── routers/
    ├── auth.ts                # getSession, getCurrentUser
    ├── organization.ts        # getOrg, updateSettings, updateBranding
    ├── members.ts             # listMembers, invite, removeMember, changeRole
    └── sites.ts               # listSites, addSite, updateSite, deleteSite
```

### Context

Every tRPC request gets:
- `session` — Better-Auth session (or null if unauthenticated)
- `user` — User object from session
- `db` — Drizzle client instance
- `activeOrg` — Current org + member role (from session header or cookie)

### Key Procedures

**organization router:**
- `getOrg` — returns current org + settings (requires member role)
- `updateSettings` — update branding, scan frequency defaults (requires admin role)
- `completeOnboarding` — marks onboarding as done (requires owner role)

**members router:**
- `list` — all members + pending invitations (requires member role)
- `invite` — send email invite with role (requires admin role). Sends via Resend with magic link pointing to `/invite/[token]`
- `removeMember` — remove a member (requires admin role, can't remove owner)
- `changeRole` — change member role (requires admin role, can't change owner)

**sites router:**
- `list` — paginated sites for current org with compliance score (requires viewer role)
- `add` — add new site URL + name (requires member role). Validates URL format, checks against siteQuota
- `update` — update site name, scan frequency, status (requires member role)
- `delete` — soft delete (archive) a site (requires admin role)

---

## 5. Pages & UI

### App Router Layout

```
app/
├── (marketing)/                    # Public layout (no sidebar)
│   ├── layout.tsx                  # Marketing shell
│   └── page.tsx                    # Landing page placeholder
├── (auth)/                         # Auth layout (centered card)
│   ├── layout.tsx                  # Centered auth card shell
│   ├── login/page.tsx              # Email/password + Google login
│   ├── signup/page.tsx             # Email + password + org name
│   ├── verify-email/page.tsx       # "Check your email" screen
│   └── invite/[token]/page.tsx     # Accept invite → create account or link
├── (dashboard)/                    # Protected layout (sidebar + topbar)
│   ├── layout.tsx                  # Sidebar + topbar + org context provider
│   ├── onboarding/page.tsx         # 3-step wizard
│   ├── page.tsx                    # Dashboard home (redirect to /sites for now)
│   ├── sites/page.tsx              # Site list with add button
│   ├── team/page.tsx               # Members list + invite
│   └── settings/page.tsx           # Org settings, branding, billing placeholder
└── api/
    ├── trpc/[trpc]/route.ts        # tRPC HTTP handler
    └── auth/[...all]/route.ts      # Better-Auth catch-all route
```

### Dashboard Shell

- **Sidebar**: Logo (org branding), navigation links (Dashboard, Sites, Team, Settings), user avatar + dropdown at bottom
- **Topbar**: Org name, breadcrumb, "Add Site" quick action button
- **Main content**: Rendered page content

### Onboarding Wizard (3 steps)

Shown after first signup if `onboardingCompleted === false`.

**Step 1 — Branding:**
- Upload org logo (stored via Vercel Blob — free 256MB, returns a URL we store in `organization.logo`)
- Pick brand color (color picker, default #6366f1)
- "Next" button

**Step 2 — Add First Site:**
- URL input with validation (must be valid URL with protocol)
- Friendly name input (auto-generated from domain if empty)
- "Add Site" button → saves to `sites` table
- "Next" button

**Step 3 — Ready to Scan:**
- Summary: "Your org [name] is set up with [site name]"
- "Run First Scan" button — Phase 1 shows a toast "Scanner coming soon! We'll notify you when it's ready." and redirects to dashboard
- Sets `onboardingCompleted = true`

### Invite Acceptance Flow

1. Invitee clicks magic link → `/invite/[token]`
2. If not logged in → signup form (pre-filled email from invitation)
3. If logged in with matching email → auto-accept, redirect to dashboard
4. If logged in with different email → show "This invite was sent to [email]. Log in with that account or create a new one."
5. On acceptance → Better-Auth creates member record, invitation status → "accepted"

---

## 6. Email Templates (Resend)

Two transactional emails in Phase 1:

**Email verification:**
- Subject: "Verify your AccessAudit account"
- Body: Welcome message + verification link
- Triggered on signup

**Team invite:**
- Subject: "[Inviter name] invited you to [Org name] on AccessAudit"
- Body: Invite details + role + accept link
- Triggered when admin/owner invites a member

Use React Email templates (Resend's recommended approach) — stored in `apps/web/src/emails/`.

---

## 7. Environment Variables

```env
# Database
DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/access-audit

# Better-Auth
BETTER_AUTH_SECRET=<random-32-char-string>
BETTER_AUTH_URL=http://localhost:3000  # or production URL

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Resend
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 8. What Phase 1 Does NOT Include

- Scan functionality (Phase 2)
- AI fix suggestions (Phase 3)
- Charts, compliance scores, scan history (Phase 4)
- Billing/payments (Phase 5)
- PDF reports, compliance badges (Phase 6)
- White-label subdomain routing (Phase 7)
- Landing page content (Phase 8)

These are explicitly deferred. Phase 1 lays the foundation so all of these can be added incrementally.

---

## 9. Testing Strategy

- **Schema validation**: Drizzle push to a test database, verify all tables created correctly
- **Auth flow**: Manual testing of signup → verify email → login → session persistence
- **RBAC**: Manual testing of role-based access (owner vs member vs viewer)
- **tRPC routes**: Test via the dashboard UI — add site, invite member, change settings
- **Invite flow**: End-to-end test of invite email → accept → join org

Automated tests come in later phases once the core product loop is validated.

---

## 10. Dependencies (Key Packages)

### apps/web
- next (15.x)
- react, react-dom (19.x)
- better-auth
- @trpc/server, @trpc/client, @trpc/react-query, @trpc/next
- @tanstack/react-query
- resend
- @react-email/components
- tailwindcss, postcss, autoprefixer

### packages/db
- drizzle-orm
- drizzle-kit
- @neondatabase/serverless
- dotenv

### packages/ui
- tailwindcss
- class-variance-authority
- clsx, tailwind-merge
- @radix-ui/* (as needed by shadcn components)
- lucide-react (icons)

### Dev dependencies (root)
- turbo
- typescript
- eslint, prettier
- @types/node, @types/react
