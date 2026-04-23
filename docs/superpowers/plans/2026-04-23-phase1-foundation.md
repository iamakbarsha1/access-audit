# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AccessAudit monorepo with auth, database, tRPC API, and dashboard shell — a working app where agency owners sign up, create orgs, add sites, invite members, and navigate a dashboard.

**Architecture:** Turborepo monorepo with Next.js 15 (App Router) on Vercel. PostgreSQL (Neon) via Drizzle ORM. Better-Auth for authentication with organizations plugin. tRPC v11 for type-safe API. shadcn/ui for components.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, tRPC v11, Better-Auth, Drizzle ORM, Neon PostgreSQL, shadcn/ui, Tailwind CSS v3, Resend, Vercel Blob, Turborepo, pnpm

---

## File Structure

```
access-audit/
├── package.json                        # Root workspace config
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
├── .env.example
├── .npmrc
├── packages/
│   ├── tsconfig/                       # Shared TypeScript configs
│   │   ├── base.json
│   │   ├── nextjs.json
│   │   ├── node.json
│   │   └── package.json
│   └── db/                             # Drizzle schema + client
│       ├── package.json
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts
│           ├── client.ts
│           └── schema/
│               ├── index.ts
│               ├── auth.ts
│               ├── organizations.ts
│               └── sites.ts
├── apps/
│   ├── web/                            # Next.js 15 App
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── components.json
│   │   └── src/
│   │       ├── middleware.ts
│   │       ├── env.ts
│   │       ├── styles/globals.css
│   │       ├── lib/
│   │       │   ├── auth.ts
│   │       │   ├── auth-client.ts
│   │       │   └── utils.ts
│   │       ├── trpc/
│   │       │   ├── init.ts
│   │       │   ├── middleware.ts
│   │       │   ├── client.tsx
│   │       │   ├── query-client.ts
│   │       │   ├── server.ts
│   │       │   └── routers/
│   │       │       ├── _app.ts
│   │       │       ├── auth.ts
│   │       │       ├── organization.ts
│   │       │       ├── members.ts
│   │       │       └── sites.ts
│   │       ├── emails/
│   │       │   ├── verification.tsx
│   │       │   └── invite.tsx
│   │       ├── components/
│   │       │   ├── providers.tsx
│   │       │   ├── ui/                 # shadcn components
│   │       │   ├── dashboard/
│   │       │   │   ├── sidebar.tsx
│   │       │   │   └── topbar.tsx
│   │       │   └── onboarding/
│   │       │       ├── step-branding.tsx
│   │       │       ├── step-add-site.tsx
│   │       │       └── step-ready.tsx
│   │       └── app/
│   │           ├── layout.tsx
│   │           ├── (marketing)/
│   │           │   ├── layout.tsx
│   │           │   └── page.tsx
│   │           ├── (auth)/
│   │           │   ├── layout.tsx
│   │           │   ├── login/page.tsx
│   │           │   ├── signup/page.tsx
│   │           │   ├── verify-email/page.tsx
│   │           │   └── invite/[token]/page.tsx
│   │           ├── (dashboard)/
│   │           │   ├── layout.tsx
│   │           │   ├── page.tsx
│   │           │   ├── onboarding/page.tsx
│   │           │   ├── sites/page.tsx
│   │           │   ├── team/page.tsx
│   │           │   └── settings/page.tsx
│   │           └── api/
│   │               ├── auth/[...all]/route.ts
│   │               └── trpc/[trpc]/route.ts
│   └── scanner/                        # Placeholder for Phase 2
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       └── src/index.ts
```

---

## Task Dependency Graph

```
Task 1 (Monorepo) → Task 2 (TSConfig) → Task 3 (DB) → Task 4 (Next.js)
                                                              ↓
Task 5 (shadcn) → Task 6 (Auth) → Task 7 (tRPC) → Task 8 (Routers)
                                                         ↓
Task 9 (Auth Pages) → Task 10 (Dashboard Shell) → Task 11 (Onboarding)
                                                         ↓
                                              Task 12 (Pages: Sites/Team/Settings)
                                                         ↓
                                              Task 13 (Email + Invite + Scanner)
```

---

### Task 1: Root Monorepo Setup

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.npmrc`

- [ ] **Step 1: Initialize git and create root package.json**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git init
```

```json
// package.json
{
  "name": "access-audit",
  "private": true,
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev",
    "lint": "turbo lint",
    "db:generate": "turbo db:generate",
    "db:migrate": "turbo db:migrate",
    "db:push": "turbo db:push"
  },
  "devDependencies": {
    "turbo": "^2"
  },
  "packageManager": "pnpm@9.15.4"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    },
    "db:push": {
      "cache": false
    }
  }
}
```

- [ ] **Step 4: Create .npmrc**

```ini
# .npmrc
auto-install-peers=true
```

- [ ] **Step 5: Create .gitignore**

```gitignore
# .gitignore
# Dependencies
node_modules/

# Next.js
.next/
out/

# Build
dist/
.turbo/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Debug
npm-debug.log*
pnpm-debug.log*

# Drizzle
drizzle/meta/

# Vercel
.vercel

# Superpowers
.superpowers/
```

- [ ] **Step 6: Create .env.example**

```env
# .env.example

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/access-audit?sslmode=require

# Better-Auth
BETTER_AUTH_SECRET=generate-a-random-32-char-string-here
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Resend (Email)
RESEND_API_KEY=

# Vercel Blob (Logo Storage)
BLOB_READ_WRITE_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 7: Install root dependencies and commit**

```bash
pnpm install
git add -A
git commit -m "chore: initialize turborepo monorepo structure"
```

---

### Task 2: TypeScript Config Package

**Files:**
- Create: `packages/tsconfig/package.json`
- Create: `packages/tsconfig/base.json`
- Create: `packages/tsconfig/nextjs.json`
- Create: `packages/tsconfig/node.json`

- [ ] **Step 1: Create package.json**

```json
// packages/tsconfig/package.json
{
  "name": "@access-audit/tsconfig",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
}
```

- [ ] **Step 2: Create base.json**

```json
// packages/tsconfig/base.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create nextjs.json**

```json
// packages/tsconfig/nextjs.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  }
}
```

- [ ] **Step 4: Create node.json**

```json
// packages/tsconfig/node.json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/tsconfig/
git commit -m "chore: add shared typescript config package"
```

---

### Task 3: Database Package (Schema & Client)

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/schema/organizations.ts`
- Create: `packages/db/src/schema/sites.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/index.ts`

- [ ] **Step 1: Create package.json and install dependencies**

```json
// packages/db/package.json
{
  "name": "@access-audit/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./schema": "./src/schema/index.ts"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10",
    "drizzle-orm": "^0.38"
  },
  "devDependencies": {
    "@access-audit/tsconfig": "workspace:*",
    "drizzle-kit": "^0.30",
    "dotenv": "^16",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/db/tsconfig.json
{
  "extends": "@access-audit/tsconfig/node.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Create drizzle.config.ts**

```ts
// packages/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Create auth schema (Better-Auth managed tables)**

```ts
// packages/db/src/schema/auth.ts
import {
  pgTable,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});
```

- [ ] **Step 5: Create organization settings schema (custom)**

```ts
// packages/db/src/schema/organizations.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const organizationSettings = pgTable("organization_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" })
    .unique(),
  brandColor: text("brandColor").notNull().default("#6366f1"),
  plan: text("plan").notNull().default("trial"),
  dodoCustomerId: text("dodoCustomerId"),
  dodoSubscriptionId: text("dodoSubscriptionId"),
  trialEndsAt: timestamp("trialEndsAt").notNull(),
  siteQuota: integer("siteQuota").notNull().default(25),
  scanQuota: integer("scanQuota").notNull().default(50),
  onboardingCompleted: boolean("onboardingCompleted").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
```

- [ ] **Step 6: Create sites schema (custom)**

```ts
// packages/db/src/schema/sites.ts
import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    scanFrequency: text("scanFrequency").notNull().default("daily"),
    complianceScore: integer("complianceScore"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    unique("sites_org_url_unique").on(table.organizationId, table.url),
  ]
);
```

- [ ] **Step 7: Create schema barrel export**

```ts
// packages/db/src/schema/index.ts
export * from "./auth";
export * from "./organizations";
export * from "./sites";
```

- [ ] **Step 8: Create database client**

```ts
// packages/db/src/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle({ client: sql, schema });

export type Database = typeof db;
```

- [ ] **Step 9: Create package entry point**

```ts
// packages/db/src/index.ts
export { db, type Database } from "./client";
export * from "./schema";
export { eq, and, or, desc, asc, sql, count } from "drizzle-orm";
```

- [ ] **Step 10: Install dependencies and commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
pnpm install
git add packages/db/
git commit -m "feat: add database package with Drizzle schema for auth, orgs, and sites"
```

---

### Task 4: Next.js App Scaffolding

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/styles/globals.css`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/env.ts`
- Create: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Create package.json**

```json
// apps/web/package.json
{
  "name": "@access-audit/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@access-audit/db": "workspace:*",
    "@neondatabase/serverless": "^0.10",
    "@tanstack/react-query": "^5",
    "@trpc/client": "^11",
    "@trpc/react-query": "^11",
    "@trpc/server": "^11",
    "@vercel/blob": "^0.27",
    "better-auth": "^1.3",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "lucide-react": "^0.469",
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "resend": "^4",
    "@react-email/components": "^0.0.36",
    "tailwind-merge": "^2",
    "zod": "^3"
  },
  "devDependencies": {
    "@access-audit/tsconfig": "workspace:*",
    "@tailwindcss/forms": "^0.5",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "autoprefixer": "^10",
    "postcss": "^8",
    "tailwindcss": "^3",
    "tailwindcss-animate": "^1",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// apps/web/tsconfig.json
{
  "extends": "@access-audit/tsconfig/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.ts**

```ts
// apps/web/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@access-audit/db"],
};

export default nextConfig;
```

- [ ] **Step 4: Create tailwind.config.ts**

```ts
// apps/web/tailwind.config.ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import forms from "@tailwindcss/forms";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate, forms],
};

export default config;
```

- [ ] **Step 5: Create postcss.config.mjs**

```js
// apps/web/postcss.config.mjs
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
export default config;
```

- [ ] **Step 6: Create globals.css with shadcn theme variables**

```css
/* apps/web/src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 239 84% 67%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 239 84% 67%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 239 84% 67%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 239 84% 67%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 7: Create utils.ts (cn helper)**

```ts
// apps/web/src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Create env.ts (runtime env validation)**

```ts
// apps/web/src/env.ts
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 9: Create root layout**

```tsx
// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AccessAudit - ADA Accessibility Compliance",
  description: "Scan websites for WCAG violations and generate compliance reports",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 10: Create placeholder Providers component**

```tsx
// apps/web/src/components/providers.tsx
"use client";

export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 11: Install dependencies and commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
pnpm install
git add apps/web/
git commit -m "feat: scaffold Next.js 15 app with Tailwind and shadcn theme"
```

---

### Task 5: shadcn/ui Components Setup

**Files:**
- Create: `apps/web/components.json`
- Create: Multiple files in `apps/web/src/components/ui/`

- [ ] **Step 1: Create components.json for shadcn CLI**

```json
// apps/web/components.json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 2: Install all shadcn components needed for Phase 1**

Run from `apps/web/`:

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit/apps/web
npx shadcn@latest add button input label card dialog sheet avatar dropdown-menu select badge separator tabs sonner --yes
```

This installs: Button, Input, Label, Card, Dialog, Sheet, Avatar, DropdownMenu, Select, Badge, Separator, Tabs, Sonner (toast).

- [ ] **Step 3: Verify components were created**

Run: `ls src/components/ui/`
Expected: `avatar.tsx button.tsx badge.tsx card.tsx dialog.tsx dropdown-menu.tsx input.tsx label.tsx select.tsx separator.tsx sheet.tsx sonner.tsx tabs.tsx`

- [ ] **Step 4: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/components.json apps/web/src/components/ui/
git commit -m "feat: install shadcn/ui components for Phase 1"
```

---

### Task 6: Better-Auth (Server + Client + API Route + Middleware)

**Files:**
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/app/api/auth/[...all]/route.ts`
- Create: `apps/web/src/middleware.ts`

- [ ] **Step 1: Create Better-Auth server configuration**

```ts
// apps/web/src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "@access-audit/db/client";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    async sendVerificationEmail({ user, url }) {
      if (!resend) {
        console.log(`[DEV] Verification email for ${user.email}: ${url}`);
        return;
      }
      await resend.emails.send({
        from: "AccessAudit <noreply@accessaudit.com>",
        to: user.email,
        subject: "Verify your AccessAudit account",
        html: `
          <h2>Welcome to AccessAudit!</h2>
          <p>Hi ${user.name},</p>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${url}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
            Verify Email
          </a>
          <p>If you didn't create an account, you can safely ignore this email.</p>
        `,
      });
    },
  },

  plugins: [
    organization({
      async sendInvitationEmail(data) {
        const inviteLink = `${process.env.BETTER_AUTH_URL}/invite/${data.id}`;
        if (!resend) {
          console.log(`[DEV] Invite email for ${data.email}: ${inviteLink}`);
          return;
        }
        await resend.emails.send({
          from: "AccessAudit <noreply@accessaudit.com>",
          to: data.email,
          subject: `${data.inviter.user.name} invited you to ${data.organization.name} on AccessAudit`,
          html: `
            <h2>You've been invited!</h2>
            <p>${data.inviter.user.name} has invited you to join <strong>${data.organization.name}</strong> on AccessAudit as a <strong>${data.role}</strong>.</p>
            <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">
              Accept Invitation
            </a>
          `,
        });
      },
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 2: Create Better-Auth React client**

```ts
// apps/web/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [organizationClient()],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  useActiveOrganization,
} = authClient;
```

- [ ] **Step 3: Create Better-Auth API route handler**

```ts
// apps/web/src/app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

- [ ] **Step 4: Create Next.js middleware for route protection**

```ts
// apps/web/src/middleware.ts
import { type NextRequest, NextResponse } from "next/server";

const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/verify-email",
  "/api/auth",
  "/invite",
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/trpc")
  ) {
    return NextResponse.next();
  }

  // Check for Better-Auth session cookie
  const sessionToken = request.cookies.get("better-auth.session_token");
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/lib/auth.ts apps/web/src/lib/auth-client.ts apps/web/src/app/api/auth/ apps/web/src/middleware.ts
git commit -m "feat: configure Better-Auth with org plugin, Google OAuth, and route protection"
```

---

### Task 7: tRPC Foundation (Init + Client + Provider + Route Handler)

**Files:**
- Create: `apps/web/src/trpc/init.ts`
- Create: `apps/web/src/trpc/query-client.ts`
- Create: `apps/web/src/trpc/client.tsx`
- Create: `apps/web/src/trpc/server.ts`
- Create: `apps/web/src/app/api/trpc/[trpc]/route.ts`
- Modify: `apps/web/src/components/providers.tsx`

- [ ] **Step 1: Create tRPC initialization with auth context**

```ts
// apps/web/src/trpc/init.ts
import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/lib/auth";
import { db } from "@access-audit/db/client";
import { headers } from "next/headers";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });

  return {
    db,
    session,
    user: session?.user ?? null,
  };
};

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
```

- [ ] **Step 2: Create QueryClient factory**

```ts
// apps/web/src/trpc/query-client.ts
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}
```

- [ ] **Step 3: Create tRPC React client with provider**

```tsx
// apps/web/src/trpc/client.tsx
"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState } from "react";
import { makeQueryClient } from "./query-client";
import type { AppRouter } from "./routers/_app";

export const trpc = createTRPCReact<AppRouter>();

let clientQueryClientSingleton: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!clientQueryClientSingleton) {
    clientQueryClientSingleton = makeQueryClient();
  }
  return clientQueryClientSingleton;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchStreamLink({
          url: getBaseUrl() + "/api/trpc",
          headers() {
            const h = new Headers();
            h.set("x-trpc-source", "nextjs-react");
            return h;
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
```

- [ ] **Step 4: Create server-side caller**

```ts
// apps/web/src/trpc/server.ts
import "server-only";
import { headers } from "next/headers";
import { createCallerFactory, createTRPCContext } from "./init";
import { appRouter } from "./routers/_app";

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  return createCaller(
    await createTRPCContext({
      headers: await headers(),
    })
  );
}
```

- [ ] **Step 5: Create placeholder root router (will be filled in Task 8)**

```ts
// apps/web/src/trpc/routers/_app.ts
import { createTRPCRouter } from "../init";

export const appRouter = createTRPCRouter({});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: Create tRPC API route handler**

```ts
// apps/web/src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createTRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 7: Update Providers to include TRPCReactProvider**

```tsx
// apps/web/src/components/providers.tsx
"use client";

import { TRPCReactProvider } from "@/trpc/client";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCReactProvider>
      {children}
      <Toaster />
    </TRPCReactProvider>
  );
}
```

- [ ] **Step 8: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/trpc/ apps/web/src/app/api/trpc/ apps/web/src/components/providers.tsx
git commit -m "feat: set up tRPC v11 with auth context, React provider, and route handler"
```

---

### Task 8: tRPC Middleware & All Routers

**Files:**
- Create: `apps/web/src/trpc/middleware.ts`
- Create: `apps/web/src/trpc/routers/auth.ts`
- Create: `apps/web/src/trpc/routers/organization.ts`
- Create: `apps/web/src/trpc/routers/members.ts`
- Create: `apps/web/src/trpc/routers/sites.ts`
- Modify: `apps/web/src/trpc/routers/_app.ts`

- [ ] **Step 1: Create auth and org middleware**

```ts
// apps/web/src/trpc/middleware.ts
import { TRPCError } from "@trpc/server";
import { baseProcedure } from "./init";
import { member as memberTable } from "@access-audit/db/schema";
import { eq, and } from "@access-audit/db";

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

export const authedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      session: ctx.session,
      user: ctx.user,
    },
  });
});

export function orgProcedure(minRole: Role = "viewer") {
  return authedProcedure.use(async ({ ctx, next }) => {
    const orgId = ctx.session.session.activeOrganizationId;
    if (!orgId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active organization selected",
      });
    }

    const members = await ctx.db
      .select()
      .from(memberTable)
      .where(
        and(
          eq(memberTable.organizationId, orgId),
          eq(memberTable.userId, ctx.user.id)
        )
      );

    const membership = members[0];
    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Not a member of this organization",
      });
    }

    const userRoleLevel = ROLE_HIERARCHY[membership.role as Role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userRoleLevel < requiredLevel) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires ${minRole} role or higher`,
      });
    }

    return next({
      ctx: {
        orgId,
        membership,
      },
    });
  });
}
```

- [ ] **Step 2: Create auth router**

```ts
// apps/web/src/trpc/routers/auth.ts
import { createTRPCRouter, baseProcedure } from "../init";

export const authRouter = createTRPCRouter({
  getSession: baseProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  getCurrentUser: baseProcedure.query(({ ctx }) => {
    return ctx.user;
  }),
});
```

- [ ] **Step 3: Create organization router**

```ts
// apps/web/src/trpc/routers/organization.ts
import { z } from "zod";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import {
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq } from "@access-audit/db";

export const organizationRouter = createTRPCRouter({
  getOrg: orgProcedure("viewer").query(async ({ ctx }) => {
    const orgs = await ctx.db
      .select()
      .from(organization)
      .where(eq(organization.id, ctx.orgId));

    const settings = await ctx.db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, ctx.orgId));

    return {
      organization: orgs[0] ?? null,
      settings: settings[0] ?? null,
    };
  }),

  updateSettings: orgProcedure("admin")
    .input(
      z.object({
        brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(organizationSettings)
        .set({
          ...(input.brandColor && { brandColor: input.brandColor }),
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, ctx.orgId))
        .returning();

      return updated[0];
    }),

  completeOnboarding: orgProcedure("owner").mutation(async ({ ctx }) => {
    const updated = await ctx.db
      .update(organizationSettings)
      .set({
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(organizationSettings.organizationId, ctx.orgId))
      .returning();

    return updated[0];
  }),
});
```

- [ ] **Step 4: Create members router**

```ts
// apps/web/src/trpc/routers/members.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { member, invitation, user } from "@access-audit/db/schema";
import { eq, and } from "@access-audit/db";
import { auth } from "@/lib/auth";

export const membersRouter = createTRPCRouter({
  list: orgProcedure("viewer").query(async ({ ctx }) => {
    const members = await ctx.db
      .select({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, ctx.orgId));

    const invitations = await ctx.db
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, ctx.orgId),
          eq(invitation.status, "pending")
        )
      );

    return { members, invitations };
  }),

  invite: orgProcedure("admin")
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["admin", "member", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api.createInvitation({
        headers: new Headers(),
        body: {
          email: input.email,
          role: input.role,
          organizationId: ctx.orgId,
        },
      });
      return result;
    }),

  removeMember: orgProcedure("admin")
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, ctx.orgId)
          )
        );

      if (!target[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      if (target[0].role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot remove the owner",
        });
      }

      await ctx.db
        .delete(member)
        .where(eq(member.id, input.memberId));

      return { success: true };
    }),

  changeRole: orgProcedure("admin")
    .input(
      z.object({
        memberId: z.string(),
        role: z.enum(["admin", "member", "viewer"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db
        .select()
        .from(member)
        .where(
          and(
            eq(member.id, input.memberId),
            eq(member.organizationId, ctx.orgId)
          )
        );

      if (!target[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }
      if (target[0].role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot change the owner's role",
        });
      }

      const updated = await ctx.db
        .update(member)
        .set({ role: input.role })
        .where(eq(member.id, input.memberId))
        .returning();

      return updated[0];
    }),
});
```

- [ ] **Step 5: Create sites router**

```ts
// apps/web/src/trpc/routers/sites.ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import { sites, organizationSettings } from "@access-audit/db/schema";
import { eq, and, count } from "@access-audit/db";

export const sitesRouter = createTRPCRouter({
  list: orgProcedure("viewer").query(async ({ ctx }) => {
    const result = await ctx.db
      .select()
      .from(sites)
      .where(eq(sites.organizationId, ctx.orgId))
      .orderBy(sites.createdAt);

    return result;
  }),

  add: orgProcedure("member")
    .input(
      z.object({
        url: z.string().url("Must be a valid URL"),
        name: z.string().min(1, "Name is required").max(100),
        scanFrequency: z
          .enum(["manual", "daily", "weekly", "monthly"])
          .default("daily"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check site quota
      const settings = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const quota = settings[0]?.siteQuota ?? 25;

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

      // Check for duplicate URL in org
      const existing = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.organizationId, ctx.orgId),
            eq(sites.url, input.url)
          )
        );

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This URL is already added to your organization",
        });
      }

      const inserted = await ctx.db
        .insert(sites)
        .values({
          organizationId: ctx.orgId,
          url: input.url,
          name: input.name,
          scanFrequency: input.scanFrequency,
        })
        .returning();

      return inserted[0];
    }),

  update: orgProcedure("member")
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        scanFrequency: z
          .enum(["manual", "daily", "weekly", "monthly"])
          .optional(),
        status: z.enum(["active", "paused"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const existing = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, id), eq(sites.organizationId, ctx.orgId)));

      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const updated = await ctx.db
        .update(sites)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(sites.id, id))
        .returning();

      return updated[0];
    }),

  delete: orgProcedure("admin")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(sites)
        .where(
          and(eq(sites.id, input.id), eq(sites.organizationId, ctx.orgId))
        );

      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      // Soft delete - archive
      const updated = await ctx.db
        .update(sites)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(sites.id, input.id))
        .returning();

      return updated[0];
    }),
});
```

- [ ] **Step 6: Update root router to merge all sub-routers**

```ts
// apps/web/src/trpc/routers/_app.ts
import { createTRPCRouter } from "../init";
import { authRouter } from "./auth";
import { organizationRouter } from "./organization";
import { membersRouter } from "./members";
import { sitesRouter } from "./sites";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  members: membersRouter,
  sites: sitesRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 7: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/trpc/
git commit -m "feat: add tRPC middleware (auth + RBAC) and all Phase 1 routers"
```

---

### Task 9: Auth Pages (Login, Signup, Verify Email)

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/(auth)/signup/page.tsx`
- Create: `apps/web/src/app/(auth)/verify-email/page.tsx`

- [ ] **Step 1: Create auth layout (centered card shell)**

```tsx
// apps/web/src/app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create login page**

```tsx
// apps/web/src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn.email({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Login failed");
      return;
    }
    router.push(callbackUrl);
  }

  async function handleGoogleLogin() {
    await signIn.social({ provider: "google", callbackURL: callbackUrl });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your AccessAudit account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogleLogin}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 3: Create signup page**

```tsx
// apps/web/src/app/(auth)/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // 1. Create user account
    const { error } = await signUp.email({
      name,
      email,
      password,
    });

    if (error) {
      toast.error(error.message || "Signup failed");
      setLoading(false);
      return;
    }

    // 2. Create organization
    const orgSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const orgResult = await authClient.organization.create({
      name: orgName,
      slug: orgSlug,
    });

    if (orgResult.error) {
      toast.error("Account created but failed to create organization. Please try again from the dashboard.");
      setLoading(false);
      router.push("/verify-email");
      return;
    }

    // 3. Set as active organization
    await authClient.organization.setActive({
      organizationId: orgResult.data.id,
    });

    setLoading(false);
    router.push("/verify-email");
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>
          Start your free 7-day trial of AccessAudit
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgName">Agency / Company name</Label>
            <Input
              id="orgName"
              placeholder="Acme Web Agency"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              placeholder="jane@acmeagency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min 8 characters"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 4: Create verify-email page**

```tsx
// apps/web/src/app/(auth)/verify-email/page.tsx
"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.user?.emailVerified) {
      router.push("/onboarding");
    }
  }, [session, router]);

  async function handleResend() {
    const { error } = await authClient.sendVerificationEmail({
      email: session?.user?.email ?? "",
    });
    if (error) {
      toast.error("Failed to resend verification email");
      return;
    }
    toast.success("Verification email sent!");
  }

  return (
    <Card className="text-center">
      <CardHeader>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to{" "}
          <strong>{session?.user?.email ?? "your email"}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Click the link in the email to verify your account and get started.
        </p>
        <Button variant="outline" onClick={handleResend}>
          Resend verification email
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/app/\(auth\)/
git commit -m "feat: add auth pages (login, signup, verify-email)"
```

---

### Task 10: Dashboard Shell (Layout, Sidebar, Topbar)

**Files:**
- Create: `apps/web/src/components/dashboard/sidebar.tsx`
- Create: `apps/web/src/components/dashboard/topbar.tsx`
- Create: `apps/web/src/app/(dashboard)/layout.tsx`
- Create: `apps/web/src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create sidebar component**

```tsx
// apps/web/src/components/dashboard/sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Users,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useSession, useActiveOrganization } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/team", label: "Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: activeOrg } = useActiveOrganization();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      {/* Logo / Org Name */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        {activeOrg?.logo ? (
          <img
            src={activeOrg.logo}
            alt={activeOrg.name}
            className="h-8 w-8 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            {activeOrg?.name?.charAt(0) ?? "A"}
          </div>
        )}
        <span className="font-semibold truncate">
          {activeOrg?.name ?? "AccessAudit"}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 px-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session?.user?.image ?? undefined} />
                <AvatarFallback>
                  {session?.user?.name?.charAt(0) ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium truncate max-w-[140px]">
                  {session?.user?.name ?? "User"}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                  {session?.user?.email}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create topbar component**

```tsx
// apps/web/src/components/dashboard/topbar.tsx
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/sites": "Sites",
  "/team": "Team",
  "/settings": "Settings",
  "/onboarding": "Getting Started",
};

export function Topbar() {
  const pathname = usePathname();
  const { data: activeOrg } = useActiveOrganization();
  const title = pageTitles[pathname] ?? "Dashboard";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {activeOrg?.name}
        </span>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/sites">
            <Plus className="mr-1 h-4 w-4" />
            Add Site
          </Link>
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create dashboard layout**

```tsx
// apps/web/src/app/(dashboard)/layout.tsx
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create dashboard home page (redirects to /sites)**

```tsx
// apps/web/src/app/(dashboard)/page.tsx
import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/sites");
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/components/dashboard/ apps/web/src/app/\(dashboard\)/
git commit -m "feat: add dashboard shell with sidebar, topbar, and layout"
```

---

### Task 11: Onboarding Wizard

**Files:**
- Create: `apps/web/src/components/onboarding/step-branding.tsx`
- Create: `apps/web/src/components/onboarding/step-add-site.tsx`
- Create: `apps/web/src/components/onboarding/step-ready.tsx`
- Create: `apps/web/src/app/(dashboard)/onboarding/page.tsx`
- Create: `apps/web/src/app/api/upload-logo/route.ts`

- [ ] **Step 1: Create logo upload API route (Vercel Blob)**

```ts
// apps/web/src/app/api/upload-logo/route.ts
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be under 2MB" }, { status: 400 });
  }

  const blob = await put(`logos/${session.user.id}-${Date.now()}`, file, {
    access: "public",
  });

  return NextResponse.json({ url: blob.url });
}
```

- [ ] **Step 2: Create Step 1 - Branding**

```tsx
// apps/web/src/components/onboarding/step-branding.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useActiveOrganization } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

interface StepBrandingProps {
  onNext: () => void;
}

export function StepBranding({ onNext }: StepBrandingProps) {
  const { data: activeOrg } = useActiveOrganization();
  const updateSettings = trpc.organization.updateSettings.useMutation();
  const [brandColor, setBrandColor] = useState("#6366f1");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload-logo", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) {
      toast.error(data.error || "Upload failed");
      return;
    }

    setLogoUrl(data.url);

    // Update org logo via Better-Auth
    if (activeOrg) {
      await authClient.organization.update({
        data: { logo: data.url },
        organizationId: activeOrg.id,
      });
    }
  }

  async function handleNext() {
    await updateSettings.mutateAsync({ brandColor });
    onNext();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Customize your brand</h2>
        <p className="text-sm text-muted-foreground">
          Add your agency logo and pick a brand color.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Organization logo</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-16 w-16 rounded-lg object-cover border"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                {activeOrg?.name?.charAt(0) ?? "A"}
              </div>
            )}
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                PNG, JPG up to 2MB
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brandColor">Brand color</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="brandColor"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border"
            />
            <Input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#6366f1"
              className="w-32"
            />
          </div>
        </div>
      </div>

      <Button onClick={handleNext} disabled={updateSettings.isPending}>
        {updateSettings.isPending ? "Saving..." : "Next"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Create Step 2 - Add First Site**

```tsx
// apps/web/src/components/onboarding/step-add-site.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/trpc/client";
import { toast } from "sonner";

interface StepAddSiteProps {
  onNext: () => void;
}

export function StepAddSite({ onNext }: StepAddSiteProps) {
  const addSite = trpc.sites.add.useMutation();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  function autoName(urlValue: string) {
    try {
      const hostname = new URL(urlValue).hostname.replace("www.", "");
      setName(hostname);
    } catch {
      // URL not valid yet, ignore
    }
  }

  async function handleAddSite(e: React.FormEvent) {
    e.preventDefault();
    const result = await addSite.mutateAsync({
      url,
      name: name || new URL(url).hostname,
    });
    if (result) {
      toast.success("Site added!");
      onNext();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Add your first site</h2>
        <p className="text-sm text-muted-foreground">
          Enter a website URL to start monitoring for accessibility issues.
        </p>
      </div>

      <form onSubmit={handleAddSite} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="siteUrl">Website URL</Label>
          <Input
            id="siteUrl"
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (!name) autoName(e.target.value);
            }}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="siteName">Friendly name</Label>
          <Input
            id="siteName"
            placeholder="Auto-generated from URL"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={addSite.isPending}>
          {addSite.isPending ? "Adding..." : "Add Site"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create Step 3 - Ready**

```tsx
// apps/web/src/components/onboarding/step-ready.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/trpc/client";
import { useActiveOrganization } from "@/lib/auth-client";
import { toast } from "sonner";

export function StepReady() {
  const router = useRouter();
  const { data: activeOrg } = useActiveOrganization();
  const completeOnboarding = trpc.organization.completeOnboarding.useMutation();
  const sitesList = trpc.sites.list.useQuery();
  const firstSite = sitesList.data?.[0];

  async function handleFinish() {
    await completeOnboarding.mutateAsync();
    toast.info("Scanner coming soon! We'll notify you when it's ready.");
    router.push("/sites");
  }

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-8 w-8 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold">You&apos;re all set!</h2>
        <p className="text-sm text-muted-foreground">
          Your org <strong>{activeOrg?.name}</strong> is set up
          {firstSite ? (
            <>
              {" "}
              with <strong>{firstSite.name}</strong>
            </>
          ) : null}
          .
        </p>
      </div>
      <Button onClick={handleFinish} disabled={completeOnboarding.isPending}>
        {completeOnboarding.isPending ? "Finishing..." : "Go to Dashboard"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create onboarding page with step navigation**

```tsx
// apps/web/src/app/(dashboard)/onboarding/page.tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StepBranding } from "@/components/onboarding/step-branding";
import { StepAddSite } from "@/components/onboarding/step-add-site";
import { StepReady } from "@/components/onboarding/step-ready";
import { cn } from "@/lib/utils";

const steps = ["Branding", "Add Site", "Ready"];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="mx-auto max-w-xl py-8">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                i <= currentStep
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                "text-sm",
                i <= currentStep
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="mx-2 h-px w-8 bg-border" />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {currentStep === 0 && (
            <StepBranding onNext={() => setCurrentStep(1)} />
          )}
          {currentStep === 1 && (
            <StepAddSite onNext={() => setCurrentStep(2)} />
          )}
          {currentStep === 2 && <StepReady />}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/components/onboarding/ apps/web/src/app/\(dashboard\)/onboarding/ apps/web/src/app/api/upload-logo/
git commit -m "feat: add 3-step onboarding wizard with logo upload and site creation"
```

---

### Task 12: Dashboard Pages (Sites, Team, Settings)

**Files:**
- Create: `apps/web/src/app/(dashboard)/sites/page.tsx`
- Create: `apps/web/src/app/(dashboard)/team/page.tsx`
- Create: `apps/web/src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create sites page**

```tsx
// apps/web/src/app/(dashboard)/sites/page.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SitesPage() {
  const utils = trpc.useUtils();
  const sitesQuery = trpc.sites.list.useQuery();
  const addSite = trpc.sites.add.useMutation({
    onSuccess: () => {
      utils.sites.list.invalidate();
      setDialogOpen(false);
      setNewUrl("");
      setNewName("");
      toast.success("Site added!");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteSite = trpc.sites.delete.useMutation({
    onSuccess: () => {
      utils.sites.list.invalidate();
      toast.success("Site archived");
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");

  const activeSites =
    sitesQuery.data?.filter((s) => s.status !== "archived") ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sites</h2>
          <p className="text-muted-foreground">
            Manage websites monitored for accessibility compliance.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              Add Site
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a new site</DialogTitle>
              <DialogDescription>
                Enter the URL and name for the website you want to monitor.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addSite.mutate({ url: newUrl, name: newName || new URL(newUrl).hostname });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="My Website"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={addSite.isPending}>
                  {addSite.isPending ? "Adding..." : "Add Site"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sitesQuery.isLoading ? (
        <p className="text-muted-foreground">Loading sites...</p>
      ) : activeSites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No sites yet</p>
            <p className="text-sm text-muted-foreground">
              Add your first website to start monitoring.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activeSites.map((site) => (
            <Card key={site.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">{site.name}</CardTitle>
                  <CardDescription>{site.url}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={site.status === "active" ? "default" : "secondary"}>
                    {site.status}
                  </Badge>
                  {site.complianceScore !== null && (
                    <Badge variant="outline">{site.complianceScore}%</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSite.mutate({ id: site.id })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create team page**

```tsx
// apps/web/src/app/(dashboard)/team/page.tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

export default function TeamPage() {
  const utils = trpc.useUtils();
  const teamQuery = trpc.members.list.useQuery();
  const invite = trpc.members.invite.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate();
      setDialogOpen(false);
      setInviteEmail("");
      toast.success("Invitation sent!");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMember = trpc.members.removeMember.useMutation({
    onSuccess: () => {
      utils.members.list.invalidate();
      toast.success("Member removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team</h2>
          <p className="text-muted-foreground">
            Manage team members and invitations.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-1 h-4 w-4" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                Send an email invitation to join your organization.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate({ email: inviteEmail, role: inviteRole });
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="teammate@agency.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={invite.isPending}>
                  {invite.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {teamQuery.data?.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={m.userImage ?? undefined} />
                  <AvatarFallback>{m.userName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{m.userName}</p>
                  <p className="text-xs text-muted-foreground">{m.userEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{m.role}</Badge>
                {m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMember.mutate({ memberId: m.id })}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {teamQuery.data?.invitations && teamQuery.data.invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {teamQuery.data.invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited as {inv.role}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Pending</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create settings page**

```tsx
// apps/web/src/app/(dashboard)/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function SettingsPage() {
  const orgQuery = trpc.organization.getOrg.useQuery();
  const updateSettings = trpc.organization.updateSettings.useMutation({
    onSuccess: () => toast.success("Settings saved!"),
    onError: (err) => toast.error(err.message),
  });

  const [brandColor, setBrandColor] = useState("#6366f1");

  useEffect(() => {
    if (orgQuery.data?.settings?.brandColor) {
      setBrandColor(orgQuery.data.settings.brandColor);
    }
  }, [orgQuery.data]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground">
          Manage your organization settings and preferences.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
              <CardDescription>
                Customize your brand color for reports and badges.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Brand color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
              <Button
                onClick={() => updateSettings.mutate({ brandColor })}
                disabled={updateSettings.isPending}
              >
                {updateSettings.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium">
                  {orgQuery.data?.organization?.name}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Slug</span>
                <span className="text-sm font-medium">
                  {orgQuery.data?.organization?.slug}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge>{orgQuery.data?.settings?.plan ?? "trial"}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="pt-4">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-lg font-medium">Billing coming soon</p>
              <p className="text-sm text-muted-foreground">
                Powered by Dodo Payments. Available in Phase 5.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add apps/web/src/app/\(dashboard\)/sites/ apps/web/src/app/\(dashboard\)/team/ apps/web/src/app/\(dashboard\)/settings/
git commit -m "feat: add sites, team, and settings dashboard pages"
```

---

### Task 13: Email Templates, Invite Flow, Marketing Page, Scanner Placeholder & Build Verification

**Files:**
- Create: `apps/web/src/emails/verification.tsx`
- Create: `apps/web/src/emails/invite.tsx`
- Create: `apps/web/src/app/(auth)/invite/[token]/page.tsx`
- Create: `apps/web/src/app/(marketing)/layout.tsx`
- Create: `apps/web/src/app/(marketing)/page.tsx`
- Create: `apps/scanner/package.json`
- Create: `apps/scanner/tsconfig.json`
- Create: `apps/scanner/Dockerfile`
- Create: `apps/scanner/src/index.ts`

- [ ] **Step 1: Create verification email template**

```tsx
// apps/web/src/emails/verification.tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface VerificationEmailProps {
  userName: string;
  verificationUrl: string;
}

export function VerificationEmail({
  userName,
  verificationUrl,
}: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your AccessAudit account</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            margin: "40px auto",
            padding: "40px",
            maxWidth: "480px",
          }}
        >
          <Heading style={{ fontSize: "24px", marginBottom: "16px" }}>
            Welcome to AccessAudit!
          </Heading>
          <Text>Hi {userName},</Text>
          <Text>
            Please verify your email address to get started with accessibility
            compliance monitoring.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button
              href={verificationUrl}
              style={{
                backgroundColor: "#6366f1",
                borderRadius: "6px",
                color: "#ffffff",
                display: "inline-block",
                fontSize: "16px",
                padding: "12px 24px",
                textDecoration: "none",
              }}
            >
              Verify Email
            </Button>
          </Section>
          <Text style={{ color: "#71717a", fontSize: "14px" }}>
            If you didn&apos;t create an account, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Create invite email template**

```tsx
// apps/web/src/emails/invite.tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface InviteEmailProps {
  inviterName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
}

export function InviteEmail({
  inviterName,
  organizationName,
  role,
  inviteUrl,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to {organizationName} on AccessAudit
      </Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            margin: "40px auto",
            padding: "40px",
            maxWidth: "480px",
          }}
        >
          <Heading style={{ fontSize: "24px", marginBottom: "16px" }}>
            You&apos;ve been invited!
          </Heading>
          <Text>
            <strong>{inviterName}</strong> has invited you to join{" "}
            <strong>{organizationName}</strong> on AccessAudit as a{" "}
            <strong>{role}</strong>.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button
              href={inviteUrl}
              style={{
                backgroundColor: "#6366f1",
                borderRadius: "6px",
                color: "#ffffff",
                display: "inline-block",
                fontSize: "16px",
                padding: "12px 24px",
                textDecoration: "none",
              }}
            >
              Accept Invitation
            </Button>
          </Section>
          <Text style={{ color: "#71717a", fontSize: "14px" }}>
            This invitation will expire in 7 days.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Create invite acceptance page**

```tsx
// apps/web/src/app/(auth)/invite/[token]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptInvite() {
    setAccepting(true);
    const result = await authClient.organization.acceptInvitation({
      invitationId: params.token,
    });

    if (result.error) {
      setError(result.error.message || "Failed to accept invitation");
      setAccepting(false);
      return;
    }

    toast.success("Invitation accepted!");
    router.push("/");
  }

  useEffect(() => {
    if (!isPending && session && !accepting && !error) {
      acceptInvite();
    }
  }, [session, isPending]);

  if (isPending) {
    return (
      <Card className="text-center">
        <CardContent className="py-12">
          <p>Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card className="text-center">
        <CardHeader>
          <CardTitle>You&apos;ve been invited!</CardTitle>
          <CardDescription>
            Create an account or sign in to accept this invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link href={`/signup?callbackUrl=/invite/${params.token}`}>
              Create Account
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/login?callbackUrl=/invite/${params.token}`}>
              Sign In
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="text-center">
        <CardHeader>
          <CardTitle>Invitation Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="text-center">
      <CardContent className="py-12">
        <p>{accepting ? "Accepting invitation..." : "Redirecting..."}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create marketing layout and placeholder page**

```tsx
// apps/web/src/app/(marketing)/layout.tsx
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <span className="text-xl font-bold text-primary">AccessAudit</span>
        <nav className="flex items-center gap-4">
          <a
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Start Free Trial
          </a>
        </nav>
      </header>
      {children}
    </div>
  );
}
```

```tsx
// apps/web/src/app/(marketing)/page.tsx
export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        ADA Accessibility
        <br />
        <span className="text-primary">Made Simple</span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        Scan websites for WCAG violations, get AI-powered fix suggestions, and
        generate branded compliance reports for your clients.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          href="/signup"
          className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Start Free Trial
        </a>
        <a
          href="#features"
          className="rounded-md border px-6 py-3 text-sm font-semibold hover:bg-muted"
        >
          Learn More
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Create scanner placeholder**

```json
// apps/scanner/package.json
{
  "name": "@access-audit/scanner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {},
  "devDependencies": {
    "@access-audit/tsconfig": "workspace:*",
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

```json
// apps/scanner/tsconfig.json
{
  "extends": "@access-audit/tsconfig/node.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

```ts
// apps/scanner/src/index.ts
console.log("AccessAudit Scanner Service — Phase 2");
```

```dockerfile
# apps/scanner/Dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

- [ ] **Step 6: Install all dependencies and verify build**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
pnpm install
pnpm build
```

Expected: All packages build without errors. If there are TypeScript errors, fix them before committing.

- [ ] **Step 7: Push schema to database**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit/packages/db
pnpm db:push
```

Expected: All tables created in Neon PostgreSQL (user, session, account, verification, organization, member, invitation, organization_settings, sites).

- [ ] **Step 8: Verify dev server starts**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
pnpm dev
```

Expected: Next.js dev server starts on http://localhost:3000 without errors. Visit the URL to confirm the marketing landing page renders.

- [ ] **Step 9: Final commit**

```bash
cd /Users/akbarsha/Documents/code/claude-code/access-audit
git add -A
git commit -m "feat: complete Phase 1 foundation — auth, tRPC, dashboard, onboarding, team, sites"
```
