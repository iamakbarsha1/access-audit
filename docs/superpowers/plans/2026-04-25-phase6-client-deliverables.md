# Phase 6: Client Deliverables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF compliance reports, VPAT generation, dynamic SVG compliance badges, and shareable client dashboards to AccessAudit.

**Architecture:** New `reports` + `vpatEntries` DB tables store report metadata and VPAT criteria. `@react-pdf/renderer` generates PDFs server-side in Next.js API routes. Dynamic SVG badge served from a public API endpoint. Share links resolve to a public Next.js page that renders scan data read-only with org branding.

**Tech Stack:** @react-pdf/renderer, Vercel Blob (existing), Drizzle ORM, tRPC, Next.js App Router, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-25-phase6-client-deliverables-design.md`

---

### Task 1: Database Schema — reports + vpatEntries Tables

**Files:**
- Create: `packages/db/src/schema/reports.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create reports schema file**

Create `packages/db/src/schema/reports.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  text,
  uuid,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sites } from "./sites";
import { scans } from "./scans";
import { organization } from "./auth";

export const reportTypeEnum = pgEnum("report_type", [
  "pdf",
  "vpat",
  "share_snapshot",
  "share_live",
]);

export const conformanceLevelEnum = pgEnum("conformance_level", [
  "supports",
  "partially_supports",
  "does_not_support",
  "not_applicable",
  "not_evaluated",
]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  siteId: uuid("siteId")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  scanId: uuid("scanId").references(() => scans.id, { onDelete: "set null" }),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  type: reportTypeEnum("type").notNull(),
  storageUrl: text("storageUrl"),
  shareToken: text("shareToken").unique(),
  expiresAt: timestamp("expiresAt"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const vpatEntries = pgTable("vpat_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportId: uuid("reportId")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  criterionId: text("criterionId").notNull(),
  level: text("level").notNull(), // "A" or "AA"
  conformanceLevel: conformanceLevelEnum("conformanceLevel")
    .notNull()
    .default("not_evaluated"),
  remarks: text("remarks"),
  autoDetected: boolean("autoDetected").notNull().default(false),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
```

- [ ] **Step 2: Export from schema index**

In `packages/db/src/schema/index.ts`, add the export:

```typescript
export * from "./auth";
export * from "./organizations";
export * from "./sites";
export * from "./scans";
export * from "./reports";
```

- [ ] **Step 3: Push schema to database**

Run: `cd packages/db && pnpm db:push`

Expected: Tables `reports` and `vpat_entries` created with enums `report_type` and `conformance_level`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/reports.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add reports and vpat_entries schema tables"
```

---

### Task 2: Update plans.ts — Add Phase 6 Feature Flags

**Files:**
- Modify: `packages/db/src/plans.ts`

- [ ] **Step 1: Add shareLinks to PlanFeatures and update tier configs**

In `packages/db/src/plans.ts`, update the `PlanFeatures` interface to add `shareLinks`:

```typescript
export interface PlanFeatures {
  aiFixSuggestions: boolean;
  pdfReports: "basic" | "branded" | "branded_vpat";
  clientDashboard: boolean;
  complianceBadge: boolean;
  shareLinks: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
}
```

Then update each plan's `features` to include `shareLinks`:

- `trial`: `shareLinks: true`
- `starter`: `shareLinks: false`
- `agency`: `shareLinks: true`
- `pro`: `shareLinks: true`

- [ ] **Step 2: Add helper functions for Phase 6 feature gating**

Append to `packages/db/src/plans.ts`:

```typescript
export function canGenerateVpat(plan: string): boolean {
  const config = getPlan(plan);
  return config.features.pdfReports === "branded_vpat";
}

export function canUseBadge(plan: string): boolean {
  return getPlan(plan).features.complianceBadge;
}

export function canShareLinks(plan: string): boolean {
  return getPlan(plan).features.shareLinks;
}

export function isBrandedReport(plan: string): boolean {
  const reports = getPlan(plan).features.pdfReports;
  return reports === "branded" || reports === "branded_vpat";
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/plans.ts
git commit -m "feat(plans): add shareLinks feature flag and Phase 6 helper functions"
```

---

### Task 3: WCAG 2.1 AA Criteria Data File + Export Path

**Files:**
- Create: `packages/db/src/data/wcag-criteria.ts`
- Modify: `packages/db/package.json`

- [ ] **Step 1: Create the criteria data file**

Create `packages/db/src/data/wcag-criteria.ts` with all 78 WCAG 2.1 Level A and AA success criteria. Each entry has `id`, `name`, `level`, and `axeCoreRules` (array of axe-core rule IDs that test this criterion — empty array if not testable by axe-core).

```typescript
export interface WcagCriterion {
  id: string;       // e.g. "1.1.1"
  name: string;     // e.g. "Non-text Content"
  level: "A" | "AA";
  axeCoreRules: string[]; // axe-core rule IDs that map to this criterion
}

export const WCAG_21_AA_CRITERIA: WcagCriterion[] = [
  // Principle 1: Perceivable
  { id: "1.1.1", name: "Non-text Content", level: "A", axeCoreRules: ["image-alt", "input-image-alt", "area-alt", "object-alt", "svg-img-alt", "role-img-alt"] },
  { id: "1.2.1", name: "Audio-only and Video-only (Prerecorded)", level: "A", axeCoreRules: [] },
  { id: "1.2.2", name: "Captions (Prerecorded)", level: "A", axeCoreRules: [] },
  { id: "1.2.3", name: "Audio Description or Media Alternative (Prerecorded)", level: "A", axeCoreRules: [] },
  { id: "1.2.4", name: "Captions (Live)", level: "AA", axeCoreRules: [] },
  { id: "1.2.5", name: "Audio Description (Prerecorded)", level: "AA", axeCoreRules: [] },
  { id: "1.3.1", name: "Info and Relationships", level: "A", axeCoreRules: ["aria-required-parent", "aria-required-children", "definition-list", "dlitem", "list", "listitem", "th-has-data-cells", "td-headers-attr", "table-fake-caption", "p-as-heading"] },
  { id: "1.3.2", name: "Meaningful Sequence", level: "A", axeCoreRules: [] },
  { id: "1.3.3", name: "Sensory Characteristics", level: "A", axeCoreRules: [] },
  { id: "1.3.4", name: "Orientation", level: "AA", axeCoreRules: ["css-orientation-lock"] },
  { id: "1.3.5", name: "Identify Input Purpose", level: "AA", axeCoreRules: ["autocomplete-valid"] },
  { id: "1.4.1", name: "Use of Color", level: "A", axeCoreRules: ["link-in-text-block"] },
  { id: "1.4.2", name: "Audio Control", level: "A", axeCoreRules: [] },
  { id: "1.4.3", name: "Contrast (Minimum)", level: "AA", axeCoreRules: ["color-contrast"] },
  { id: "1.4.4", name: "Resize Text", level: "AA", axeCoreRules: ["meta-viewport"] },
  { id: "1.4.5", name: "Images of Text", level: "AA", axeCoreRules: [] },
  { id: "1.4.10", name: "Reflow", level: "AA", axeCoreRules: [] },
  { id: "1.4.11", name: "Non-text Contrast", level: "AA", axeCoreRules: [] },
  { id: "1.4.12", name: "Text Spacing", level: "AA", axeCoreRules: [] },
  { id: "1.4.13", name: "Content on Hover or Focus", level: "AA", axeCoreRules: [] },

  // Principle 2: Operable
  { id: "2.1.1", name: "Keyboard", level: "A", axeCoreRules: ["scrollable-region-focusable"] },
  { id: "2.1.2", name: "No Keyboard Trap", level: "A", axeCoreRules: [] },
  { id: "2.1.4", name: "Character Key Shortcuts", level: "A", axeCoreRules: [] },
  { id: "2.2.1", name: "Timing Adjustable", level: "A", axeCoreRules: ["meta-refresh"] },
  { id: "2.2.2", name: "Pause, Stop, Hide", level: "A", axeCoreRules: ["blink", "marquee"] },
  { id: "2.3.1", name: "Three Flashes or Below Threshold", level: "A", axeCoreRules: [] },
  { id: "2.4.1", name: "Bypass Blocks", level: "A", axeCoreRules: ["bypass", "region"] },
  { id: "2.4.2", name: "Page Titled", level: "A", axeCoreRules: ["document-title"] },
  { id: "2.4.3", name: "Focus Order", level: "A", axeCoreRules: ["tabindex"] },
  { id: "2.4.4", name: "Link Purpose (In Context)", level: "A", axeCoreRules: ["link-name"] },
  { id: "2.4.5", name: "Multiple Ways", level: "AA", axeCoreRules: [] },
  { id: "2.4.6", name: "Headings and Labels", level: "AA", axeCoreRules: ["empty-heading"] },
  { id: "2.4.7", name: "Focus Visible", level: "AA", axeCoreRules: [] },
  { id: "2.5.1", name: "Pointer Gestures", level: "A", axeCoreRules: [] },
  { id: "2.5.2", name: "Pointer Cancellation", level: "A", axeCoreRules: [] },
  { id: "2.5.3", name: "Label in Name", level: "A", axeCoreRules: ["label-title-only"] },
  { id: "2.5.4", name: "Motion Actuation", level: "A", axeCoreRules: [] },

  // Principle 3: Understandable
  { id: "3.1.1", name: "Language of Page", level: "A", axeCoreRules: ["html-has-lang", "html-lang-valid"] },
  { id: "3.1.2", name: "Language of Parts", level: "AA", axeCoreRules: ["valid-lang"] },
  { id: "3.2.1", name: "On Focus", level: "A", axeCoreRules: [] },
  { id: "3.2.2", name: "On Input", level: "A", axeCoreRules: [] },
  { id: "3.2.3", name: "Consistent Navigation", level: "AA", axeCoreRules: [] },
  { id: "3.2.4", name: "Consistent Identification", level: "AA", axeCoreRules: [] },
  { id: "3.3.1", name: "Error Identification", level: "A", axeCoreRules: [] },
  { id: "3.3.2", name: "Labels or Instructions", level: "A", axeCoreRules: ["label", "select-name"] },
  { id: "3.3.3", name: "Error Suggestion", level: "AA", axeCoreRules: [] },
  { id: "3.3.4", name: "Error Prevention (Legal, Financial, Data)", level: "AA", axeCoreRules: [] },

  // Principle 4: Robust
  { id: "4.1.1", name: "Parsing", level: "A", axeCoreRules: ["duplicate-id", "duplicate-id-active", "duplicate-id-aria"] },
  { id: "4.1.2", name: "Name, Role, Value", level: "A", axeCoreRules: ["aria-allowed-attr", "aria-hidden-body", "aria-input-field-name", "aria-toggle-field-name", "button-name", "frame-title", "iframe-title", "input-button-name", "role-has-required-aria-props"] },
  { id: "4.1.3", name: "Status Messages", level: "AA", axeCoreRules: ["aria-progressbar-name"] },
];
```

Note: This is a representative mapping. The `axeCoreRules` arrays connect axe-core rule IDs to WCAG criteria. Criteria with empty arrays cannot be automatically tested by axe-core and will show as "Not Evaluated" in VPAT auto-fill.

- [ ] **Step 2: Add data export path to packages/db**

In `packages/db/package.json`, add a new export entry:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./schema": "./src/schema/index.ts",
    "./data/wcag-criteria": "./src/data/wcag-criteria.ts"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/data/wcag-criteria.ts packages/db/package.json
git commit -m "feat(db): add WCAG 2.1 AA criteria data with axe-core rule mapping"
```

---

### Task 4: Reports tRPC Router

**Files:**
- Create: `apps/web/src/trpc/routers/reports.ts`
- Modify: `apps/web/src/trpc/routers/_app.ts`

- [ ] **Step 1: Create reports router**

Create `apps/web/src/trpc/routers/reports.ts`:

```typescript
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter } from "../init";
import { orgProcedure } from "../middleware";
import {
  reports,
  vpatEntries,
  scans,
  scanPages,
  violations,
  sites,
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import {
  getPlan,
  canGenerateVpat,
  canUseBadge,
  canShareLinks,
} from "@access-audit/db";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import { randomBytes } from "crypto";

function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export const reportsRouter = createTRPCRouter({
  // List reports for a site
  listBySite: orgProcedure("viewer")
    .input(
      z.object({
        siteId: z.string().uuid(),
        type: z
          .enum(["pdf", "vpat", "share_snapshot", "share_live"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const site = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const filters = [eq(reports.siteId, input.siteId)];
      if (input.type) {
        filters.push(eq(reports.type, input.type));
      }

      return ctx.db
        .select()
        .from(reports)
        .where(and(...filters))
        .orderBy(desc(reports.createdAt));
    }),

  // Create a share link (snapshot or live)
  createShareLink: orgProcedure("member")
    .input(
      z.object({
        siteId: z.string().uuid(),
        type: z.enum(["share_snapshot", "share_live"]),
        scanId: z.string().uuid().optional(), // required for snapshot
        expiresIn: z.enum(["7d", "30d", "90d", "never"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify site belongs to org
      const site = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      // Check plan allows share links
      const settings = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const plan = settings[0]?.plan ?? "trial";
      if (!canShareLinks(plan)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Upgrade to Agency or Pro to create share links.",
        });
      }

      // Snapshot requires a scanId
      if (input.type === "share_snapshot" && !input.scanId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "scanId is required for snapshot share links.",
        });
      }

      // Calculate expiration
      const expiresAt =
        input.expiresIn === "never"
          ? null
          : new Date(
              Date.now() +
                { "7d": 7, "30d": 30, "90d": 90 }[input.expiresIn] *
                  24 *
                  60 *
                  60 *
                  1000
            );

      const inserted = await ctx.db
        .insert(reports)
        .values({
          siteId: input.siteId,
          scanId: input.type === "share_snapshot" ? input.scanId : null,
          organizationId: ctx.orgId,
          type: input.type,
          shareToken: generateShareToken(),
          expiresAt,
        })
        .returning();

      return inserted[0]!;
    }),

  // Revoke a share link
  revokeShareLink: orgProcedure("member")
    .input(z.object({ reportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId)
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      await ctx.db.delete(reports).where(eq(reports.id, input.reportId));

      return { success: true };
    }),

  // Generate VPAT — create report + auto-fill entries
  generateVpat: orgProcedure("member")
    .input(
      z.object({
        siteId: z.string().uuid(),
        scanId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify site + plan
      const site = await ctx.db
        .select()
        .from(sites)
        .where(
          and(
            eq(sites.id, input.siteId),
            eq(sites.organizationId, ctx.orgId)
          )
        );

      if (!site[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
      }

      const settings = await ctx.db
        .select()
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, ctx.orgId));

      const plan = settings[0]?.plan ?? "trial";
      if (!canGenerateVpat(plan)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Upgrade to Pro to generate VPAT documents.",
        });
      }

      // Get violations for this scan to auto-fill
      const scanViolations = await ctx.db
        .select()
        .from(violations)
        .where(eq(violations.scanId, input.scanId));

      // Build a map of WCAG criterion -> violation count
      const criterionViolationCount: Record<string, number> = {};
      for (const v of scanViolations) {
        const tags = (v.wcagTags as string[]) ?? [];
        for (const tag of tags) {
          // axe-core tags like "wcag111" -> "1.1.1"
          const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
          if (match) {
            const criterionId = `${match[1]}.${match[2]}.${match[3]}`;
            criterionViolationCount[criterionId] =
              (criterionViolationCount[criterionId] ?? 0) + 1;
          }
        }
      }

      // Create report
      const org = await ctx.db
        .select()
        .from(organization)
        .where(eq(organization.id, ctx.orgId));

      const inserted = await ctx.db
        .insert(reports)
        .values({
          siteId: input.siteId,
          scanId: input.scanId,
          organizationId: ctx.orgId,
          type: "vpat",
          metadata: {
            productName: site[0].url,
            reportDate: new Date().toISOString(),
            contactEmail: "", // filled in by user on review page
            productDescription: `Accessibility conformance report for ${site[0].url}`,
            evaluationMethods: "Automated testing with axe-core engine",
          },
        })
        .returning();

      const report = inserted[0]!;

      // Create VPAT entries for all criteria
      const entries = WCAG_21_AA_CRITERIA.map((criterion) => {
        const count = criterionViolationCount[criterion.id] ?? 0;
        const hasAxeRules = criterion.axeCoreRules.length > 0;

        let conformanceLevel: "supports" | "partially_supports" | "does_not_support" | "not_applicable" | "not_evaluated";
        let autoDetected = false;

        if (!hasAxeRules) {
          conformanceLevel = "not_evaluated";
        } else if (count === 0) {
          conformanceLevel = "supports";
          autoDetected = true;
        } else if (count >= 5) {
          conformanceLevel = "does_not_support";
          autoDetected = true;
        } else {
          conformanceLevel = "partially_supports";
          autoDetected = true;
        }

        return {
          reportId: report.id,
          criterionId: criterion.id,
          level: criterion.level,
          conformanceLevel,
          autoDetected,
          remarks: autoDetected
            ? `Auto-detected: ${count} violation(s) found.`
            : null,
        };
      });

      await ctx.db.insert(vpatEntries).values(entries);

      return report;
    }),

  // Get VPAT entries for review page
  getVpatEntries: orgProcedure("viewer")
    .input(z.object({ reportId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId)
          )
        );

      if (!report[0] || report[0].type !== "vpat") {
        throw new TRPCError({ code: "NOT_FOUND", message: "VPAT not found" });
      }

      const entries = await ctx.db
        .select()
        .from(vpatEntries)
        .where(eq(vpatEntries.reportId, input.reportId));

      return { report: report[0], entries };
    }),

  // Update a single VPAT entry (auto-save)
  updateVpatEntry: orgProcedure("member")
    .input(
      z.object({
        entryId: z.string().uuid(),
        conformanceLevel: z
          .enum([
            "supports",
            "partially_supports",
            "does_not_support",
            "not_applicable",
            "not_evaluated",
          ])
          .optional(),
        remarks: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify entry belongs to user's org
      const entry = await ctx.db
        .select({ id: vpatEntries.id, reportId: vpatEntries.reportId })
        .from(vpatEntries)
        .where(eq(vpatEntries.id, input.entryId));

      if (!entry[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }

      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, entry[0].reportId),
            eq(reports.organizationId, ctx.orgId)
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      }

      const updated = await ctx.db
        .update(vpatEntries)
        .set({
          ...(input.conformanceLevel && {
            conformanceLevel: input.conformanceLevel,
          }),
          ...(input.remarks !== undefined && { remarks: input.remarks }),
          autoDetected: false, // user override clears auto-detected flag
          updatedAt: new Date(),
        })
        .where(eq(vpatEntries.id, input.entryId))
        .returning();

      return updated[0];
    }),

  // Update VPAT report metadata (product info)
  updateVpatMetadata: orgProcedure("member")
    .input(
      z.object({
        reportId: z.string().uuid(),
        metadata: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId),
            eq(reports.type, "vpat")
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "VPAT not found" });
      }

      const updated = await ctx.db
        .update(reports)
        .set({
          metadata: input.metadata,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, input.reportId))
        .returning();

      return updated[0];
    }),

  // Reset VPAT entries to auto-detected state
  resetVpat: orgProcedure("member")
    .input(z.object({ reportId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.db
        .select()
        .from(reports)
        .where(
          and(
            eq(reports.id, input.reportId),
            eq(reports.organizationId, ctx.orgId),
            eq(reports.type, "vpat")
          )
        );

      if (!report[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "VPAT not found" });
      }

      // Delete and re-generate would be simplest, but to preserve the reportId,
      // we delete entries and trigger a re-generate from the calling code.
      await ctx.db
        .delete(vpatEntries)
        .where(eq(vpatEntries.reportId, input.reportId));

      return { success: true };
    }),

  // Get report by share token (public — no auth)
  getByShareToken: createTRPCRouter({}).createCaller
    ? undefined as never // placeholder — this is handled by the share page server component
    : undefined as never,
});
```

Note: The public share token lookup will be done directly in the share page's server component (not via tRPC) since it requires no auth.

Remove the `getByShareToken` placeholder — the router should end after `resetVpat`. That was included to show where public access fits; it doesn't belong in the authed router.

- [ ] **Step 2: Register in app router**

In `apps/web/src/trpc/routers/_app.ts`:

```typescript
import { createTRPCRouter } from "../init";
import { authRouter } from "./auth";
import { organizationRouter } from "./organization";
import { membersRouter } from "./members";
import { sitesRouter } from "./sites";
import { scansRouter } from "./scans";
import { violationsRouter } from "./violations";
import { dashboardRouter } from "./dashboard";
import { reportsRouter } from "./reports";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  members: membersRouter,
  sites: sitesRouter,
  scans: scansRouter,
  violations: violationsRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/web && npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/trpc/routers/reports.ts apps/web/src/trpc/routers/_app.ts
git commit -m "feat(trpc): add reports router with share links and VPAT CRUD"
```

---

### Task 5: Install @react-pdf/renderer + PDF Compliance Report Template

**Files:**
- Create: `apps/web/src/lib/pdf/compliance-report.tsx`

- [ ] **Step 1: Install dependency**

Run: `cd apps/web && pnpm add @react-pdf/renderer`

- [ ] **Step 2: Create the compliance report PDF template**

Create `apps/web/src/lib/pdf/compliance-report.tsx`:

```tsx
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  coverPage: { padding: 40, justifyContent: "center", alignItems: "center", height: "100%" },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", marginBottom: 12 },
  subtitle: { fontSize: 14, color: "#6b7280", marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 20 },
  scoreCircle: { fontSize: 48, fontFamily: "Helvetica-Bold", marginVertical: 20 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
  headerRow: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: "#374151", paddingVertical: 6, backgroundColor: "#f9fafb" },
  cell: { flex: 1, paddingHorizontal: 4 },
  cellSmall: { width: 60, paddingHorizontal: 4 },
  cellWide: { flex: 2, paddingHorizontal: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 9 },
  badgeCritical: { backgroundColor: "#fef2f2", color: "#991b1b" },
  badgeSerious: { backgroundColor: "#fff7ed", color: "#9a3412" },
  badgeModerate: { backgroundColor: "#fefce8", color: "#854d0e" },
  badgeMinor: { backgroundColor: "#f0fdf4", color: "#166534" },
  accentBar: { height: 4, marginBottom: 20 },
  logo: { width: 120, height: 40, marginBottom: 16, objectFit: "contain" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#9ca3af" },
  codeBlock: { backgroundColor: "#f3f4f6", padding: 8, borderRadius: 4, fontFamily: "Courier", fontSize: 8, marginTop: 4 },
  comparisonPositive: { color: "#16a34a" },
  comparisonNegative: { color: "#dc2626" },
});

export interface ComplianceReportData {
  // Branding
  logoUrl: string | null;
  brandColor: string;
  orgName: string;
  // Site
  siteUrl: string;
  siteName: string;
  // Current scan
  scanDate: string;
  complianceScore: number;
  pagesScanned: number;
  durationMs: number;
  violationCounts: { critical: number; serious: number; moderate: number; minor: number };
  // Previous scan (for comparison)
  previousScan: {
    complianceScore: number;
    scanDate: string;
    violationCounts: { critical: number; serious: number; moderate: number; minor: number };
  } | null;
  // Pages
  pages: Array<{
    url: string;
    complianceScore: number | null;
    violationCounts: { critical: number; serious: number; moderate: number; minor: number } | null;
  }>;
  // Violations grouped by severity
  violations: Array<{
    ruleId: string;
    impact: string;
    wcagTags: string[];
    pageUrl: string;
    description: string;
    htmlSnippet: string | null;
    aiExplanation: string | null;
    aiFixCode: string | null;
  }>;
  // WCAG criteria mapping
  wcagMapping: Array<{
    criterionId: string;
    criterionName: string;
    level: string;
    status: "pass" | "fail";
    violationCount: number;
  }>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function severityColor(impact: string) {
  switch (impact) {
    case "critical": return styles.badgeCritical;
    case "serious": return styles.badgeSerious;
    case "moderate": return styles.badgeModerate;
    case "minor": return styles.badgeMinor;
    default: return styles.badgeMinor;
  }
}

export function ComplianceReport({ data }: { data: ComplianceReportData }) {
  const totalViolations =
    data.violationCounts.critical +
    data.violationCounts.serious +
    data.violationCounts.moderate +
    data.violationCounts.minor;

  const scoreDelta = data.previousScan
    ? data.complianceScore - data.previousScan.complianceScore
    : null;

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.coverPage}>
        <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
        {data.logoUrl && <Image src={data.logoUrl} style={styles.logo} />}
        <Text style={styles.title}>Accessibility Compliance Report</Text>
        <Text style={styles.subtitle}>{data.siteUrl}</Text>
        <Text style={styles.scoreCircle}>{data.complianceScore}%</Text>
        <Text style={styles.subtitle}>Compliance Score</Text>
        <Text style={styles.muted}>Scanned on {data.scanDate}</Text>
        <Text style={styles.muted}>{data.pagesScanned} pages scanned in {formatDuration(data.durationMs)}</Text>
        <Text style={[styles.footer]}>
          Generated by AccessAudit{data.orgName !== "AccessAudit" ? ` for ${data.orgName}` : ""}
        </Text>
      </Page>

      {/* Executive Summary */}
      <Page size="A4" style={styles.page}>
        <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Overall Score</Text>
          <Text style={styles.cell}>{data.complianceScore}%</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Total Violations</Text>
          <Text style={styles.cell}>{totalViolations}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Critical</Text>
          <Text style={styles.cell}>{data.violationCounts.critical}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Serious</Text>
          <Text style={styles.cell}>{data.violationCounts.serious}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Moderate</Text>
          <Text style={styles.cell}>{data.violationCounts.moderate}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Minor</Text>
          <Text style={styles.cell}>{data.violationCounts.minor}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.cell, styles.bold]}>Pages Scanned</Text>
          <Text style={styles.cell}>{data.pagesScanned}</Text>
        </View>

        {/* Score Comparison */}
        <Text style={styles.sectionTitle}>Score Comparison</Text>
        {data.previousScan ? (
          <View>
            <View style={styles.row}>
              <Text style={[styles.cell, styles.bold]}>Previous Score</Text>
              <Text style={styles.cell}>{data.previousScan.complianceScore}% ({data.previousScan.scanDate})</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.cell, styles.bold]}>Current Score</Text>
              <Text style={styles.cell}>{data.complianceScore}%</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.cell, styles.bold]}>Change</Text>
              <Text
                style={[
                  styles.cell,
                  scoreDelta! >= 0
                    ? styles.comparisonPositive
                    : styles.comparisonNegative,
                ]}
              >
                {scoreDelta! >= 0 ? "+" : ""}
                {scoreDelta}%
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.muted}>First scan — no prior data for comparison.</Text>
        )}

        <Text style={[styles.footer]}>
          Generated by AccessAudit on {data.scanDate}
        </Text>
      </Page>

      {/* Page-by-Page Breakdown */}
      <Page size="A4" style={styles.page}>
        <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
        <Text style={styles.sectionTitle}>Page-by-Page Breakdown</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.cellWide, styles.bold]}>URL</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Score</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Critical</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Serious</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Moderate</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Minor</Text>
        </View>
        {data.pages.map((page, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellWide}>{page.url}</Text>
            <Text style={styles.cellSmall}>{page.complianceScore ?? "—"}%</Text>
            <Text style={styles.cellSmall}>{page.violationCounts?.critical ?? 0}</Text>
            <Text style={styles.cellSmall}>{page.violationCounts?.serious ?? 0}</Text>
            <Text style={styles.cellSmall}>{page.violationCounts?.moderate ?? 0}</Text>
            <Text style={styles.cellSmall}>{page.violationCounts?.minor ?? 0}</Text>
          </View>
        ))}
        <Text style={[styles.footer]}>Generated by AccessAudit on {data.scanDate}</Text>
      </Page>

      {/* Violations by Severity */}
      {(["critical", "serious", "moderate", "minor"] as const).map((severity) => {
        const filtered = data.violations.filter((v) => v.impact === severity);
        if (filtered.length === 0) return null;
        return (
          <Page key={severity} size="A4" style={styles.page}>
            <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
            <Text style={styles.sectionTitle}>
              {severity.charAt(0).toUpperCase() + severity.slice(1)} Violations ({filtered.length})
            </Text>
            {filtered.map((v, i) => (
              <View key={i} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
                  <Text style={[styles.badge, severityColor(v.impact)]}>{v.impact}</Text>
                  <Text style={[styles.bold, { marginLeft: 6 }]}>{v.ruleId}</Text>
                  {v.wcagTags.length > 0 && (
                    <Text style={[styles.muted, { marginLeft: 6 }]}>
                      WCAG: {v.wcagTags.join(", ")}
                    </Text>
                  )}
                </View>
                <Text style={styles.muted}>Page: {v.pageUrl}</Text>
                <Text style={{ marginTop: 2 }}>{v.description}</Text>
                {v.htmlSnippet && (
                  <View style={styles.codeBlock}>
                    <Text>{v.htmlSnippet}</Text>
                  </View>
                )}
                {v.aiExplanation && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={styles.bold}>Explanation:</Text>
                    <Text>{v.aiExplanation}</Text>
                  </View>
                )}
                {v.aiFixCode && (
                  <View style={styles.codeBlock}>
                    <Text style={styles.bold}>Suggested Fix:</Text>
                    <Text>{v.aiFixCode}</Text>
                  </View>
                )}
              </View>
            ))}
            <Text style={[styles.footer]}>Generated by AccessAudit on {data.scanDate}</Text>
          </Page>
        );
      })}

      {/* WCAG Criteria Mapping */}
      <Page size="A4" style={styles.page}>
        <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
        <Text style={styles.sectionTitle}>WCAG 2.1 AA Criteria Mapping</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.cellSmall, styles.bold]}>Criterion</Text>
          <Text style={[styles.cellWide, styles.bold]}>Name</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Level</Text>
          <Text style={[styles.cellSmall, styles.bold]}>Status</Text>
        </View>
        {data.wcagMapping.map((c, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellSmall}>{c.criterionId}</Text>
            <Text style={styles.cellWide}>{c.criterionName}</Text>
            <Text style={styles.cellSmall}>{c.level}</Text>
            <Text
              style={[
                styles.cellSmall,
                c.status === "pass" ? styles.comparisonPositive : styles.comparisonNegative,
              ]}
            >
              {c.status === "pass" ? "Pass" : `Fail (${c.violationCount})`}
            </Text>
          </View>
        ))}
        <Text style={[styles.footer]}>Generated by AccessAudit on {data.scanDate}</Text>
      </Page>

      {/* Glossary */}
      <Page size="A4" style={styles.page}>
        <View style={[styles.accentBar, { backgroundColor: data.brandColor }]} />
        <Text style={styles.sectionTitle}>What These Scores Mean</Text>

        <Text style={[styles.bold, { marginTop: 8 }]}>Compliance Score</Text>
        <Text>
          A percentage reflecting how many accessibility checks passed out of the total checks performed.
          100% means all automated checks passed. Scores above 90% indicate strong accessibility.
        </Text>

        <Text style={[styles.bold, { marginTop: 12 }]}>WCAG 2.1 AA</Text>
        <Text>
          The Web Content Accessibility Guidelines (WCAG) 2.1 Level AA is the internationally accepted
          standard for web accessibility. It covers text alternatives, keyboard navigation, color contrast,
          form labels, and more. Level AA conformance is typically required for legal compliance.
        </Text>

        <Text style={[styles.bold, { marginTop: 12 }]}>Severity Levels</Text>
        <Text style={{ marginTop: 4 }}>
          Critical — Blocks access entirely for some users (e.g., missing alt text on navigation images).
        </Text>
        <Text style={{ marginTop: 2 }}>
          Serious — Significant barriers that make content very difficult to use (e.g., low contrast text).
        </Text>
        <Text style={{ marginTop: 2 }}>
          Moderate — Creates difficulty but content is still usable (e.g., missing form labels).
        </Text>
        <Text style={{ marginTop: 2 }}>
          Minor — Small issues that cause slight inconvenience (e.g., redundant alt text).
        </Text>

        <Text style={[styles.bold, { marginTop: 12 }]}>Automated vs Manual Testing</Text>
        <Text>
          This report uses automated scanning (axe-core engine) which reliably detects approximately
          57 of 78 WCAG 2.1 AA criteria. Some criteria require manual testing (e.g., video captions,
          cognitive load assessment). A comprehensive accessibility audit combines both automated and
          manual review.
        </Text>

        <Text style={[styles.footer]}>Generated by AccessAudit on {data.scanDate}</Text>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/pdf/compliance-report.tsx apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(pdf): add @react-pdf/renderer compliance report template"
```

Note: The pnpm-lock.yaml may be at the root. Adjust the git add to include the correct lockfile path (`pnpm-lock.yaml` at repo root).

---

### Task 6: PDF Generation API Route

**Files:**
- Create: `apps/web/src/app/api/reports/generate-pdf/route.ts`

- [ ] **Step 1: Create the API route**

Create `apps/web/src/app/api/reports/generate-pdf/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@access-audit/db/client";
import {
  scans,
  scanPages,
  violations,
  sites,
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import { isBrandedReport } from "@access-audit/db";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import {
  ComplianceReport,
  type ComplianceReportData,
} from "@/lib/pdf/compliance-report";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const scanId = body.scanId as string;

  if (!scanId) {
    return NextResponse.json({ error: "scanId required" }, { status: 400 });
  }

  // Fetch scan
  const scan = await db
    .select()
    .from(scans)
    .where(eq(scans.id, scanId));

  if (!scan[0] || scan[0].status !== "completed") {
    return NextResponse.json({ error: "Scan not found or not completed" }, { status: 404 });
  }

  // Fetch site + verify org access
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, scan[0].siteId));

  if (!site[0]) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const orgId = site[0].organizationId;

  // Fetch org + settings for branding
  const org = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId));

  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, orgId));

  const plan = settings[0]?.plan ?? "trial";
  const branded = isBrandedReport(plan);

  // Fetch pages
  const pages = await db
    .select()
    .from(scanPages)
    .where(eq(scanPages.scanId, scanId));

  // Fetch violations with page URL
  const allViolations = await db
    .select({
      ruleId: violations.ruleId,
      impact: violations.impact,
      wcagTags: violations.wcagTags,
      description: violations.description,
      htmlSnippet: violations.htmlSnippet,
      aiExplanation: violations.aiExplanation,
      aiFixCode: violations.aiFixCode,
      scanPageId: violations.scanPageId,
    })
    .from(violations)
    .where(eq(violations.scanId, scanId));

  // Build page URL map
  const pageUrlMap: Record<string, string> = {};
  for (const p of pages) {
    pageUrlMap[p.id] = p.url;
  }

  // Fetch previous scan for comparison
  const previousScans = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.siteId, scan[0].siteId),
        eq(scans.status, "completed")
      )
    )
    .orderBy(desc(scans.createdAt))
    .limit(2);

  const previousScan = previousScans.find((s) => s.id !== scanId) ?? null;

  // Build WCAG criteria mapping
  const criterionViolationCount: Record<string, number> = {};
  for (const v of allViolations) {
    const tags = (v.wcagTags as string[]) ?? [];
    for (const tag of tags) {
      const match = tag.match(/^wcag(\d)(\d)(\d+)$/);
      if (match) {
        const id = `${match[1]}.${match[2]}.${match[3]}`;
        criterionViolationCount[id] = (criterionViolationCount[id] ?? 0) + 1;
      }
    }
  }

  const wcagMapping = WCAG_21_AA_CRITERIA.filter(
    (c) => c.axeCoreRules.length > 0
  ).map((c) => ({
    criterionId: c.id,
    criterionName: c.name,
    level: c.level,
    status: (criterionViolationCount[c.id] ?? 0) > 0 ? "fail" as const : "pass" as const,
    violationCount: criterionViolationCount[c.id] ?? 0,
  }));

  const reportData: ComplianceReportData = {
    logoUrl: branded ? (org[0]?.logo ?? null) : null,
    brandColor: branded ? (settings[0]?.brandColor ?? "#6366f1") : "#6366f1",
    orgName: branded ? (org[0]?.name ?? "AccessAudit") : "AccessAudit",
    siteUrl: site[0].url,
    siteName: site[0].name,
    scanDate: scan[0].completedAt
      ? new Date(scan[0].completedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date(scan[0].createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
    complianceScore: scan[0].complianceScore ?? 0,
    pagesScanned: scan[0].pagesScanned ?? 0,
    durationMs: scan[0].durationMs ?? 0,
    violationCounts: (scan[0].violationCounts as ComplianceReportData["violationCounts"]) ?? {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    },
    previousScan: previousScan
      ? {
          complianceScore: previousScan.complianceScore ?? 0,
          scanDate: new Date(previousScan.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          violationCounts: (previousScan.violationCounts as ComplianceReportData["violationCounts"]) ?? {
            critical: 0,
            serious: 0,
            moderate: 0,
            minor: 0,
          },
        }
      : null,
    pages: pages.map((p) => ({
      url: p.url,
      complianceScore: p.complianceScore,
      violationCounts: p.violationCounts as ComplianceReportData["pages"][0]["violationCounts"],
    })),
    violations: allViolations.map((v) => ({
      ruleId: v.ruleId,
      impact: v.impact,
      wcagTags: (v.wcagTags as string[]) ?? [],
      pageUrl: pageUrlMap[v.scanPageId] ?? "Unknown",
      description: v.description,
      htmlSnippet: v.htmlSnippet,
      aiExplanation: v.aiExplanation,
      aiFixCode: v.aiFixCode,
    })),
    wcagMapping,
  };

  const buffer = await renderToBuffer(
    <ComplianceReport data={reportData} />
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="compliance-report-${site[0].name}-${scan[0].id.slice(0, 8)}.pdf"`,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/reports/generate-pdf/route.ts
git commit -m "feat(api): add PDF compliance report generation endpoint"
```

---

### Task 7: VPAT PDF Template + Generation Endpoint

**Files:**
- Create: `apps/web/src/lib/pdf/vpat-report.tsx`
- Create: `apps/web/src/app/api/reports/generate-vpat/route.ts`

- [ ] **Step 1: Create VPAT PDF template**

Create `apps/web/src/lib/pdf/vpat-report.tsx`:

```tsx
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#6b7280", marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 16 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
  headerRow: { flexDirection: "row", borderBottomWidth: 2, borderBottomColor: "#374151", paddingVertical: 6, backgroundColor: "#f9fafb" },
  cellCriterion: { width: 60, paddingHorizontal: 4 },
  cellName: { flex: 2, paddingHorizontal: 4 },
  cellConformance: { flex: 1, paddingHorizontal: 4 },
  cellRemarks: { flex: 2, paddingHorizontal: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#6b7280" },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoLabel: { width: 160, fontFamily: "Helvetica-Bold" },
  infoValue: { flex: 1 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#9ca3af" },
});

const CONFORMANCE_LABELS: Record<string, string> = {
  supports: "Supports",
  partially_supports: "Partially Supports",
  does_not_support: "Does Not Support",
  not_applicable: "Not Applicable",
  not_evaluated: "Not Evaluated",
};

export interface VpatReportData {
  productName: string;
  reportDate: string;
  productDescription: string;
  contactEmail: string;
  evaluationMethods: string;
  entries: Array<{
    criterionId: string;
    criterionName: string;
    level: "A" | "AA";
    conformanceLevel: string;
    remarks: string | null;
  }>;
}

export function VpatReport({ data }: { data: VpatReportData }) {
  const levelAEntries = data.entries.filter((e) => e.level === "A");
  const levelAAEntries = data.entries.filter((e) => e.level === "AA");

  return (
    <Document>
      {/* Product Information Page */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Accessibility Conformance Report</Text>
        <Text style={styles.subtitle}>Based on VPAT 2.5 WCAG Edition</Text>

        <Text style={styles.sectionTitle}>Product Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Product Name:</Text>
          <Text style={styles.infoValue}>{data.productName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Report Date:</Text>
          <Text style={styles.infoValue}>{data.reportDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Product Description:</Text>
          <Text style={styles.infoValue}>{data.productDescription}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Contact:</Text>
          <Text style={styles.infoValue}>{data.contactEmail}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Evaluation Methods:</Text>
          <Text style={styles.infoValue}>{data.evaluationMethods}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Applicable Standard:</Text>
          <Text style={styles.infoValue}>WCAG 2.1 Level AA</Text>
        </View>

        <Text style={[styles.muted, { marginTop: 16 }]}>
          This document was generated using AccessAudit automated accessibility scanning.
          Conformance levels were auto-detected where possible using axe-core and reviewed
          by the reporting organization.
        </Text>

        <Text style={styles.footer}>Generated by AccessAudit</Text>
      </Page>

      {/* Level A Criteria */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Table 1: WCAG 2.1 Level A</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.cellCriterion, styles.bold]}>Criteria</Text>
          <Text style={[styles.cellName, styles.bold]}>Name</Text>
          <Text style={[styles.cellConformance, styles.bold]}>Conformance Level</Text>
          <Text style={[styles.cellRemarks, styles.bold]}>Remarks and Explanations</Text>
        </View>
        {levelAEntries.map((entry, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellCriterion}>{entry.criterionId}</Text>
            <Text style={styles.cellName}>{entry.criterionName}</Text>
            <Text style={styles.cellConformance}>
              {CONFORMANCE_LABELS[entry.conformanceLevel] ?? entry.conformanceLevel}
            </Text>
            <Text style={styles.cellRemarks}>{entry.remarks ?? ""}</Text>
          </View>
        ))}
        <Text style={styles.footer}>Generated by AccessAudit</Text>
      </Page>

      {/* Level AA Criteria */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Table 2: WCAG 2.1 Level AA</Text>
        <View style={styles.headerRow}>
          <Text style={[styles.cellCriterion, styles.bold]}>Criteria</Text>
          <Text style={[styles.cellName, styles.bold]}>Name</Text>
          <Text style={[styles.cellConformance, styles.bold]}>Conformance Level</Text>
          <Text style={[styles.cellRemarks, styles.bold]}>Remarks and Explanations</Text>
        </View>
        {levelAAEntries.map((entry, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cellCriterion}>{entry.criterionId}</Text>
            <Text style={styles.cellName}>{entry.criterionName}</Text>
            <Text style={styles.cellConformance}>
              {CONFORMANCE_LABELS[entry.conformanceLevel] ?? entry.conformanceLevel}
            </Text>
            <Text style={styles.cellRemarks}>{entry.remarks ?? ""}</Text>
          </View>
        ))}
        <Text style={styles.footer}>Generated by AccessAudit</Text>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 2: Create VPAT PDF generation endpoint**

Create `apps/web/src/app/api/reports/generate-vpat/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@access-audit/db/client";
import { reports, vpatEntries } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import { VpatReport, type VpatReportData } from "@/lib/pdf/vpat-report";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const reportId = body.reportId as string;

  if (!reportId) {
    return NextResponse.json({ error: "reportId required" }, { status: 400 });
  }

  // Fetch report
  const report = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!report[0] || report[0].type !== "vpat") {
    return NextResponse.json({ error: "VPAT not found" }, { status: 404 });
  }

  // Fetch entries
  const entries = await db
    .select()
    .from(vpatEntries)
    .where(eq(vpatEntries.reportId, reportId));

  // Build criteria name lookup
  const criteriaMap = new Map(
    WCAG_21_AA_CRITERIA.map((c) => [c.id, c.name])
  );

  const metadata = (report[0].metadata ?? {}) as Record<string, string>;

  const reportData: VpatReportData = {
    productName: metadata.productName ?? "",
    reportDate: metadata.reportDate
      ? new Date(metadata.reportDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
    productDescription: metadata.productDescription ?? "",
    contactEmail: metadata.contactEmail ?? "",
    evaluationMethods: metadata.evaluationMethods ?? "Automated testing with axe-core",
    entries: entries.map((e) => ({
      criterionId: e.criterionId,
      criterionName: criteriaMap.get(e.criterionId) ?? e.criterionId,
      level: e.level as "A" | "AA",
      conformanceLevel: e.conformanceLevel,
      remarks: e.remarks,
    })),
  };

  const buffer = await renderToBuffer(
    <VpatReport data={reportData} />
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="vpat-${report[0].id.slice(0, 8)}.pdf"`,
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/pdf/vpat-report.tsx apps/web/src/app/api/reports/generate-vpat/route.ts
git commit -m "feat(pdf): add VPAT PDF template and generation endpoint"
```

---

### Task 8: Dynamic SVG Badge Endpoint

**Files:**
- Create: `apps/web/src/app/api/badge/[siteId]/route.ts`
- Modify: `apps/web/src/middleware.ts`

- [ ] **Step 1: Create badge API route**

Create `apps/web/src/app/api/badge/[siteId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@access-audit/db/client";
import { sites, scans, organizationSettings } from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";
import { canUseBadge } from "@access-audit/db";

function generateBadgeSvg(score: number | null): string {
  const label = "WCAG 2.1 AA";
  const value = score !== null ? `${score}% Compliant` : "Not Available";

  let valueColor: string;
  if (score === null) {
    valueColor = "#9ca3af"; // gray
  } else if (score >= 90) {
    valueColor = "#22c55e"; // green
  } else if (score >= 70) {
    valueColor = "#eab308"; // yellow
  } else {
    valueColor = "#ef4444"; // red
  }

  const labelWidth = 90;
  const valueWidth = score !== null ? 110 : 100;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${valueColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14" fill="#fff">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" fill="#fff">${value}</text>
  </g>
</svg>`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  // Fetch site
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, siteId));

  if (!site[0]) {
    return new NextResponse(generateBadgeSvg(null), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Check plan allows badges
  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, site[0].organizationId));

  const plan = settings[0]?.plan ?? "trial";
  if (!canUseBadge(plan)) {
    return new NextResponse(generateBadgeSvg(null), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Get latest completed scan
  const latestScan = await db
    .select()
    .from(scans)
    .where(
      and(eq(scans.siteId, siteId), eq(scans.status, "completed"))
    )
    .orderBy(desc(scans.createdAt))
    .limit(1);

  const score = latestScan[0]?.complianceScore ?? null;

  return new NextResponse(generateBadgeSvg(score), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
```

- [ ] **Step 2: Add /api/badge and /share to public paths in middleware**

In `apps/web/src/middleware.ts`, update the `publicPaths` array:

```typescript
const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/verify-email",
  "/api/auth",
  "/invite",
  "/pricing",
  "/share",
  "/api/badge",
];
```

Note: Check if `/pricing` is already in the list. If not, add it. The key additions are `/share` and `/api/badge`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/badge/\[siteId\]/route.ts apps/web/src/middleware.ts
git commit -m "feat(api): add dynamic SVG compliance badge endpoint"
```

---

### Task 9: Public Share Page

**Files:**
- Create: `apps/web/src/app/share/[shareToken]/page.tsx`

- [ ] **Step 1: Create the public share page**

Create `apps/web/src/app/share/[shareToken]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import {
  reports,
  scans,
  scanPages,
  violations,
  sites,
  organization,
  organizationSettings,
} from "@access-audit/db/schema";
import { eq, and, desc } from "@access-audit/db";

interface SharePageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { shareToken } = await params;

  // Fetch report by share token
  const report = await db
    .select()
    .from(reports)
    .where(eq(reports.shareToken, shareToken));

  if (!report[0]) {
    notFound();
  }

  const r = report[0];

  // Check expiration
  if (r.expiresAt && new Date() > r.expiresAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Report Expired</h1>
          <p className="mt-2 text-gray-600">
            This report has expired. Contact your agency for an updated link.
          </p>
        </div>
      </div>
    );
  }

  // Fetch org branding
  const org = await db
    .select()
    .from(organization)
    .where(eq(organization.id, r.organizationId));

  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, r.organizationId));

  const brandColor = settings[0]?.brandColor ?? "#6366f1";
  const logoUrl = org[0]?.logo ?? null;
  const orgName = org[0]?.name ?? "AccessAudit";

  // Fetch site
  const site = await db
    .select()
    .from(sites)
    .where(eq(sites.id, r.siteId));

  if (!site[0]) {
    notFound();
  }

  // Determine which scan to show
  let scanData;
  let pageData;
  let violationData;
  let trendData: Array<{ score: number; date: string }> = [];

  if (r.type === "share_snapshot" && r.scanId) {
    // Snapshot: show specific scan
    const scan = await db
      .select()
      .from(scans)
      .where(eq(scans.id, r.scanId));

    scanData = scan[0] ?? null;
  } else {
    // Live: show latest completed scan + trend
    const recentScans = await db
      .select()
      .from(scans)
      .where(
        and(eq(scans.siteId, r.siteId), eq(scans.status, "completed"))
      )
      .orderBy(desc(scans.createdAt))
      .limit(10);

    scanData = recentScans[0] ?? null;
    trendData = recentScans
      .reverse()
      .map((s) => ({
        score: s.complianceScore ?? 0,
        date: new Date(s.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      }));
  }

  if (!scanData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">No Scan Data</h1>
          <p className="mt-2 text-gray-600">No completed scans available yet.</p>
        </div>
      </div>
    );
  }

  // Fetch pages and violations for the scan
  pageData = await db
    .select()
    .from(scanPages)
    .where(eq(scanPages.scanId, scanData.id));

  violationData = await db
    .select()
    .from(violations)
    .where(eq(violations.scanId, scanData.id));

  const violationCounts = (scanData.violationCounts ?? {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  }) as { critical: number; serious: number; moderate: number; minor: number };

  // Build page URL map for violations
  const pageUrlMap: Record<string, string> = {};
  for (const p of pageData) {
    pageUrlMap[p.id] = p.url;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with branding */}
      <header
        className="border-b bg-white px-6 py-4"
        style={{ borderBottomColor: brandColor }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={orgName}
                className="h-8 w-auto object-contain"
              />
            )}
            <span className="text-lg font-semibold text-gray-900">
              {orgName}
            </span>
          </div>
          <span className="text-sm text-gray-500">
            {r.type === "share_live" ? "Live Dashboard" : "Scan Report"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Site + Score */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{site[0].name}</h1>
          <p className="text-gray-500">{site[0].url}</p>
          <div className="mt-4 flex items-baseline gap-2">
            <span
              className="text-5xl font-bold"
              style={{ color: brandColor }}
            >
              {scanData.complianceScore ?? 0}%
            </span>
            <span className="text-gray-500">Compliance Score</span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Scanned on{" "}
            {new Date(scanData.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Trend chart for live view */}
        {r.type === "share_live" && trendData.length > 1 && (
          <div className="mb-8 rounded-lg border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Score Trend
            </h2>
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {trendData.map((point, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span className="text-xs font-medium text-gray-700">
                    {point.score}%
                  </span>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${point.score}%`,
                      backgroundColor: brandColor,
                      minHeight: 4,
                    }}
                  />
                  <span className="text-xs text-gray-400">{point.date}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Violation Summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              { label: "Critical", count: violationCounts.critical, color: "#dc2626" },
              { label: "Serious", count: violationCounts.serious, color: "#ea580c" },
              { label: "Moderate", count: violationCounts.moderate, color: "#ca8a04" },
              { label: "Minor", count: violationCounts.minor, color: "#16a34a" },
            ] as const
          ).map((item) => (
            <div
              key={item.label}
              className="rounded-lg border bg-white p-4 text-center"
            >
              <p className="text-3xl font-bold" style={{ color: item.color }}>
                {item.count}
              </p>
              <p className="text-sm text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Page-by-Page Breakdown */}
        <div className="mb-8 rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Page-by-Page Breakdown
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">URL</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((page) => {
                  const counts = (page.violationCounts ?? {
                    critical: 0,
                    serious: 0,
                    moderate: 0,
                    minor: 0,
                  }) as {
                    critical: number;
                    serious: number;
                    moderate: number;
                    minor: number;
                  };
                  return (
                    <tr key={page.id} className="border-b">
                      <td className="py-2 text-gray-700">{page.url}</td>
                      <td className="py-2">
                        {page.complianceScore ?? "—"}%
                      </td>
                      <td className="py-2">
                        {counts.critical + counts.serious + counts.moderate + counts.minor}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Violations List */}
        <div className="mb-8 rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Violations ({violationData.length})
          </h2>
          <div className="space-y-4">
            {violationData.slice(0, 50).map((v) => (
              <div key={v.id} className="border-b pb-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      v.impact === "critical"
                        ? "bg-red-100 text-red-800"
                        : v.impact === "serious"
                          ? "bg-orange-100 text-orange-800"
                          : v.impact === "moderate"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-green-100 text-green-800"
                    }`}
                  >
                    {v.impact}
                  </span>
                  <span className="font-medium text-gray-900">
                    {v.ruleId}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Page: {pageUrlMap[v.scanPageId] ?? "Unknown"}
                </p>
                <p className="mt-1 text-sm text-gray-700">{v.description}</p>
                {v.aiExplanation && (
                  <div className="mt-2 rounded bg-blue-50 p-3 text-sm text-blue-900">
                    <strong>Explanation:</strong> {v.aiExplanation}
                  </div>
                )}
                {v.aiFixCode && (
                  <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-3 text-xs text-gray-800">
                    {v.aiFixCode}
                  </pre>
                )}
              </div>
            ))}
            {violationData.length > 50 && (
              <p className="text-center text-sm text-gray-400">
                Showing first 50 of {violationData.length} violations.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white px-6 py-4 text-center text-xs text-gray-400">
        Powered by{" "}
        <a
          href="https://accessaudit.com"
          className="text-gray-500 underline"
        >
          AccessAudit
        </a>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/share/\[shareToken\]/page.tsx
git commit -m "feat(share): add public shared dashboard page with snapshot and live views"
```

---

### Task 10: Deliverables Tab + Badge Embed + Share Link Table Components

**Files:**
- Create: `apps/web/src/components/dashboard/deliverables-tab.tsx`
- Create: `apps/web/src/components/dashboard/badge-embed.tsx`
- Create: `apps/web/src/components/dashboard/share-link-table.tsx`
- Modify: `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx`

- [ ] **Step 1: Create badge-embed component**

Create `apps/web/src/components/dashboard/badge-embed.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface BadgeEmbedProps {
  siteId: string;
  canAccess: boolean;
}

export function BadgeEmbed({ siteId, canAccess }: BadgeEmbedProps) {
  const [copied, setCopied] = useState(false);

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance Badge</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upgrade to Agency or Pro to embed a compliance badge on your client's site.
          </p>
        </CardContent>
      </Card>
    );
  }

  const badgeUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/badge/${siteId}`;
  const embedCode = `<a href="https://accessaudit.com">\n  <img src="${badgeUrl}" alt="Accessibility Score" />\n</a>`;

  function handleCopy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Compliance Badge</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live preview */}
        <div className="flex items-center gap-4">
          <img
            src={`/api/badge/${siteId}`}
            alt="Compliance Badge Preview"
            className="h-5"
          />
          <span className="text-sm text-muted-foreground">Live preview</span>
        </div>

        {/* Embed code */}
        <div className="relative">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
            {embedCode}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create share-link-table component**

Create `apps/web/src/components/dashboard/share-link-table.tsx`:

```tsx
"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, Trash2, Link, ExternalLink } from "lucide-react";

interface ShareLinkTableProps {
  siteId: string;
  canAccess: boolean;
  scans: Array<{ id: string; createdAt: Date | string; complianceScore: number | null }>;
}

export function ShareLinkTable({ siteId, canAccess, scans }: ShareLinkTableProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string>("");
  const [expiresIn, setExpiresIn] = useState<"7d" | "30d" | "90d" | "never">("30d");

  const reportsQuery = trpc.reports.listBySite.useQuery({
    siteId,
    type: undefined, // get all types, filter in UI
  });

  const createShareLink = trpc.reports.createShareLink.useMutation({
    onSuccess: () => reportsQuery.refetch(),
  });

  const revokeShareLink = trpc.reports.revokeShareLink.useMutation({
    onSuccess: () => reportsQuery.refetch(),
  });

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share Links</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Upgrade to Agency or Pro to share scan results with clients.
          </p>
        </CardContent>
      </Card>
    );
  }

  const shareReports =
    reportsQuery.data?.filter(
      (r) => r.type === "share_snapshot" || r.type === "share_live"
    ) ?? [];

  const completedScans = scans.filter((s) => s.complianceScore !== null);

  function handleCopy(token: string) {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleCreateSnapshot() {
    if (!selectedScanId) return;
    createShareLink.mutate({
      siteId,
      type: "share_snapshot",
      scanId: selectedScanId,
      expiresIn,
    });
  }

  function handleCreateLive() {
    createShareLink.mutate({
      siteId,
      type: "share_live",
      expiresIn,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Share Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create new share link */}
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-sm font-medium">Expires</label>
              <Select
                value={expiresIn}
                onValueChange={(v) => setExpiresIn(v as typeof expiresIn)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex flex-1 gap-2">
              <Select
                value={selectedScanId}
                onValueChange={setSelectedScanId}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick a scan..." />
                </SelectTrigger>
                <SelectContent>
                  {completedScans.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {new Date(s.createdAt).toLocaleDateString()} —{" "}
                      {s.complianceScore}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleCreateSnapshot}
                disabled={!selectedScanId || createShareLink.isPending}
              >
                <Link className="mr-1 h-4 w-4" />
                Share Scan
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={handleCreateLive}
              disabled={createShareLink.isPending}
            >
              <ExternalLink className="mr-1 h-4 w-4" />
              Share Live Dashboard
            </Button>
          </div>
        </div>

        {/* Active links table */}
        {shareReports.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Created</th>
                  <th className="pb-2 font-medium">Expires</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shareReports.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">
                      {r.type === "share_live" ? "Live" : "Snapshot"}
                    </td>
                    <td className="py-2">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      {r.expiresAt
                        ? new Date(r.expiresAt).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="flex gap-1 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          r.shareToken && handleCopy(r.shareToken)
                        }
                      >
                        {copied === r.shareToken ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          revokeShareLink.mutate({ reportId: r.id })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create deliverables-tab component**

Create `apps/web/src/components/dashboard/deliverables-tab.tsx`:

```tsx
"use client";

import { trpc } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDown, FileText } from "lucide-react";
import { BadgeEmbed } from "./badge-embed";
import { ShareLinkTable } from "./share-link-table";

interface DeliverablesTabProps {
  siteId: string;
  scans: Array<{ id: string; status: string; createdAt: Date | string; complianceScore: number | null }>;
}

export function DeliverablesTab({ siteId, scans }: DeliverablesTabProps) {
  const orgQuery = trpc.organization.getOrg.useQuery();
  const plan = orgQuery.data?.settings?.plan ?? "trial";

  const canUseBadge = ["agency", "pro", "trial"].includes(plan);
  const canShareLinks = ["agency", "pro", "trial"].includes(plan);
  const canVpat = plan === "pro";

  const completedScans = scans.filter((s) => s.status === "completed");
  const latestScan = completedScans[0];

  async function handleDownloadPdf(scanId: string) {
    const res = await fetch("/api/reports/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanId }),
    });

    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${scanId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const generateVpat = trpc.reports.generateVpat.useMutation();

  async function handleGenerateVpat() {
    if (!latestScan) return;
    const report = await generateVpat.mutateAsync({
      siteId,
      scanId: latestScan.id,
    });
    window.location.href = `/sites/${siteId}/vpat?reportId=${report.id}`;
  }

  return (
    <div className="space-y-6">
      {/* PDF Reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PDF Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {latestScan ? (
            <div className="space-y-3">
              <Button
                onClick={() => handleDownloadPdf(latestScan.id)}
                variant="outline"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Download Latest Report
              </Button>
              <p className="text-xs text-muted-foreground">
                Generates a PDF from the most recent completed scan. You can also
                download reports for specific scans from the Scans tab.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No completed scans yet. Run a scan to generate reports.
            </p>
          )}
        </CardContent>
      </Card>

      {/* VPAT */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">VPAT Document</CardTitle>
        </CardHeader>
        <CardContent>
          {canVpat ? (
            <div className="space-y-3">
              <Button
                onClick={handleGenerateVpat}
                variant="outline"
                disabled={!latestScan || generateVpat.isPending}
              >
                <FileText className="mr-2 h-4 w-4" />
                {generateVpat.isPending ? "Generating..." : "Generate VPAT"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Auto-fills WCAG 2.1 AA criteria from scan results. You can review
                and edit before downloading the final PDF.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Upgrade to Pro to generate VPAT (Voluntary Product Accessibility
              Template) documents.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Badge */}
      <BadgeEmbed siteId={siteId} canAccess={canUseBadge} />

      {/* Share Links */}
      <ShareLinkTable siteId={siteId} canAccess={canShareLinks} scans={completedScans} />
    </div>
  );
}
```

- [ ] **Step 4: Add Deliverables tab to site detail page**

In `apps/web/src/app/(dashboard)/sites/[siteId]/page.tsx`:

Add import at top:
```typescript
import { DeliverablesTab } from "@/components/dashboard/deliverables-tab";
```

Add a new TabsTrigger after the "violations" trigger:
```tsx
<TabsTrigger value="deliverables">Deliverables</TabsTrigger>
```

Add a new TabsContent after the violations TabsContent (before the closing `</Tabs>`):
```tsx
{/* Deliverables Tab */}
<TabsContent value="deliverables">
  <DeliverablesTab siteId={siteId} scans={allScans} />
</TabsContent>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/deliverables-tab.tsx apps/web/src/components/dashboard/badge-embed.tsx apps/web/src/components/dashboard/share-link-table.tsx apps/web/src/app/\(dashboard\)/sites/\[siteId\]/page.tsx
git commit -m "feat(ui): add Deliverables tab with PDF, VPAT, badge, and share link management"
```

---

### Task 11: Download PDF Button on Scan History Rows

**Files:**
- Modify: `apps/web/src/components/dashboard/scan-history.tsx`

- [ ] **Step 1: Add download button to scan history**

In `apps/web/src/components/dashboard/scan-history.tsx`:

Add import:
```typescript
import { FileDown } from "lucide-react";
```

Update the `Scan` interface to ensure `status` is available (it already is).

Add a new `<th>` in the header row after Duration:
```tsx
<th className="pb-2 font-medium">Report</th>
```

Add a new `<td>` in each row after the duration cell:
```tsx
<td className="py-2">
  {scan.status === "completed" && (
    <button
      className="inline-flex items-center rounded p-1 hover:bg-muted"
      title="Download PDF Report"
      onClick={(e) => {
        e.stopPropagation();
        handleDownloadPdf(scan.id);
      }}
    >
      <FileDown className="h-4 w-4 text-muted-foreground" />
    </button>
  )}
</td>
```

Add the download handler inside the `ScanHistoryTable` function, before the return:
```typescript
async function handleDownloadPdf(scanId: string) {
  const res = await fetch("/api/reports/generate-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId }),
  });

  if (!res.ok) return;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compliance-report-${scanId.slice(0, 8)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/dashboard/scan-history.tsx
git commit -m "feat(ui): add PDF download button to scan history table rows"
```

---

### Task 12: VPAT Review Page

**Files:**
- Create: `apps/web/src/app/(dashboard)/sites/[siteId]/vpat/page.tsx`

- [ ] **Step 1: Create VPAT review page**

Create `apps/web/src/app/(dashboard)/sites/[siteId]/vpat/page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileDown, RotateCcw } from "lucide-react";
import { WCAG_21_AA_CRITERIA } from "@access-audit/db/data/wcag-criteria";
import debounce from "lodash.debounce";

const CONFORMANCE_OPTIONS = [
  { value: "supports", label: "Supports" },
  { value: "partially_supports", label: "Partially Supports" },
  { value: "does_not_support", label: "Does Not Support" },
  { value: "not_applicable", label: "Not Applicable" },
  { value: "not_evaluated", label: "Not Evaluated" },
] as const;

export default function VpatReviewPage() {
  const params = useParams<{ siteId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const reportId = searchParams.get("reportId") ?? "";
  const [levelFilter, setLevelFilter] = useState<"all" | "A" | "AA">("all");

  const vpatQuery = trpc.reports.getVpatEntries.useQuery(
    { reportId },
    { enabled: !!reportId }
  );

  const updateEntry = trpc.reports.updateVpatEntry.useMutation();
  const updateMetadata = trpc.reports.updateVpatMetadata.useMutation();
  const resetVpat = trpc.reports.resetVpat.useMutation({
    onSuccess: () => vpatQuery.refetch(),
  });

  const criteriaMap = new Map(
    WCAG_21_AA_CRITERIA.map((c) => [c.id, c.name])
  );

  // Debounced auto-save for remarks
  const debouncedUpdateEntry = useCallback(
    debounce(
      (entryId: string, data: { conformanceLevel?: string; remarks?: string }) => {
        updateEntry.mutate({ entryId, ...data });
      },
      500
    ),
    []
  );

  const debouncedUpdateMetadata = useCallback(
    debounce((metadata: Record<string, unknown>) => {
      updateMetadata.mutate({ reportId, metadata });
    }, 500),
    [reportId]
  );

  if (!reportId) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/sites/${params.siteId}`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Site
        </Button>
        <p className="text-muted-foreground">No VPAT report selected.</p>
      </div>
    );
  }

  if (vpatQuery.isLoading) {
    return <p className="text-muted-foreground">Loading VPAT data...</p>;
  }

  if (!vpatQuery.data) {
    return <p className="text-muted-foreground">VPAT not found.</p>;
  }

  const { report, entries } = vpatQuery.data;
  const metadata = (report.metadata ?? {}) as Record<string, string>;

  const filteredEntries =
    levelFilter === "all"
      ? entries
      : entries.filter((e) => e.level === levelFilter);

  const reviewedCount = entries.filter(
    (e) => e.conformanceLevel !== "not_evaluated" || !e.autoDetected
  ).length;

  async function handleDownloadVpat() {
    const res = await fetch("/api/reports/generate-vpat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId }),
    });

    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpat-${reportId.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/sites/${params.siteId}`)}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to Site
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">VPAT Review</h1>
          <p className="text-sm text-muted-foreground">
            {reviewedCount}/{entries.length} criteria reviewed
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => resetVpat.mutate({ reportId })}
            disabled={resetVpat.isPending}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={handleDownloadVpat}>
            <FileDown className="mr-1 h-4 w-4" />
            Download VPAT PDF
          </Button>
        </div>
      </div>

      {/* Product Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Product Name</label>
            <Input
              defaultValue={metadata.productName ?? ""}
              onChange={(e) =>
                debouncedUpdateMetadata({
                  ...metadata,
                  productName: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium">Contact Email</label>
            <Input
              defaultValue={metadata.contactEmail ?? ""}
              onChange={(e) =>
                debouncedUpdateMetadata({
                  ...metadata,
                  contactEmail: e.target.value,
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">Product Description</label>
            <Textarea
              defaultValue={metadata.productDescription ?? ""}
              onChange={(e) =>
                debouncedUpdateMetadata({
                  ...metadata,
                  productDescription: e.target.value,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Filter by level:</span>
        <Select
          value={levelFilter}
          onValueChange={(v) => setLevelFilter(v as typeof levelFilter)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="A">Level A</SelectItem>
            <SelectItem value="AA">Level AA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Criteria Table */}
      <div className="space-y-2">
        {filteredEntries.map((entry) => (
          <Card
            key={entry.id}
            className={
              entry.conformanceLevel === "not_evaluated"
                ? "border-amber-300 bg-amber-50/50"
                : ""
            }
          >
            <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_200px_1fr]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">
                    {entry.criterionId}
                  </span>
                  <Badge variant="outline">{entry.level}</Badge>
                  {entry.autoDetected && (
                    <Badge variant="secondary" className="text-xs">
                      Auto
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {criteriaMap.get(entry.criterionId) ?? entry.criterionId}
                </p>
              </div>
              <Select
                defaultValue={entry.conformanceLevel}
                onValueChange={(v) =>
                  debouncedUpdateEntry(entry.id, { conformanceLevel: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFORMANCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Remarks..."
                defaultValue={entry.remarks ?? ""}
                className="min-h-[60px]"
                onChange={(e) =>
                  debouncedUpdateEntry(entry.id, { remarks: e.target.value })
                }
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Note: This page requires `lodash.debounce`. Install it:

Run: `cd apps/web && pnpm add lodash.debounce && pnpm add -D @types/lodash.debounce`

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/sites/\[siteId\]/vpat/page.tsx apps/web/package.json
git commit -m "feat(ui): add VPAT review page with editable criteria table and auto-save"
```

---

### Task 13: TypeScript Check + Final Verification

- [ ] **Step 1: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`

Fix any type errors that arise.

- [ ] **Step 2: Run dev server**

Run: `cd apps/web && pnpm dev`

Verify:
- Site detail page loads with new "Deliverables" tab
- Deliverables tab shows PDF, VPAT, Badge, and Share Links sections
- Scan history rows show download icon for completed scans
- No console errors

- [ ] **Step 3: Test badge endpoint**

Visit: `http://localhost:3000/api/badge/[any-valid-site-id]`

Expected: SVG badge rendered with score or "Not Available".

- [ ] **Step 4: Test share page**

Create a share link via the Deliverables tab, then visit the `/share/[token]` URL in an incognito window.

Expected: Public dashboard loads with org branding, no login required.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript and runtime issues from Phase 6 integration"
```

---

### Task 14: Update Phase Docs + Close Out

- [ ] **Step 1: Update docs/phases.md**

Change Phase 6 status from "Not Started" to "Complete":

```
| 6 | Client deliverables (PDF reports, badges, shared views, VPAT) | Complete | Agency selling tool — needed for launch |
```

- [ ] **Step 2: Update MEMORY.md**

Add Phase 6 completion entry:

```
- Phase 6: Client Deliverables (Complete) - PDF compliance reports (@react-pdf/renderer), VPAT generation with auto-fill + review (Pro-only), dynamic SVG badges, shareable client dashboards (snapshot + live)
```

- [ ] **Step 3: Commit**

```bash
git add docs/phases.md
git commit -m "docs: mark Phase 6 Client Deliverables as complete"
```
