import { describe, it, expect } from "vitest";

/**
 * Tests for the RBAC role hierarchy and middleware logic.
 * Since tRPC middleware is tightly coupled to Next.js/Better-Auth context,
 * we test the pure logic (role hierarchy, plan checking) directly.
 */

// ─── Role Hierarchy (mirrors apps/web/src/trpc/middleware.ts) ────────

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

function hasMinRole(userRole: string, minRole: Role): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as Role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole];
  return userLevel >= requiredLevel;
}

describe("RBAC Role Hierarchy", () => {
  describe("role levels", () => {
    it("owner has highest level (4)", () => {
      expect(ROLE_HIERARCHY.owner).toBe(4);
    });

    it("admin has level 3", () => {
      expect(ROLE_HIERARCHY.admin).toBe(3);
    });

    it("member has level 2", () => {
      expect(ROLE_HIERARCHY.member).toBe(2);
    });

    it("viewer has lowest level (1)", () => {
      expect(ROLE_HIERARCHY.viewer).toBe(1);
    });
  });

  describe("hasMinRole checks", () => {
    // Owner can do everything
    it("owner meets all minimum roles", () => {
      expect(hasMinRole("owner", "viewer")).toBe(true);
      expect(hasMinRole("owner", "member")).toBe(true);
      expect(hasMinRole("owner", "admin")).toBe(true);
      expect(hasMinRole("owner", "owner")).toBe(true);
    });

    // Admin can do admin, member, viewer
    it("admin meets admin and below", () => {
      expect(hasMinRole("admin", "viewer")).toBe(true);
      expect(hasMinRole("admin", "member")).toBe(true);
      expect(hasMinRole("admin", "admin")).toBe(true);
    });

    it("admin cannot meet owner requirement", () => {
      expect(hasMinRole("admin", "owner")).toBe(false);
    });

    // Member can do member and viewer
    it("member meets member and viewer", () => {
      expect(hasMinRole("member", "viewer")).toBe(true);
      expect(hasMinRole("member", "member")).toBe(true);
    });

    it("member cannot meet admin or owner", () => {
      expect(hasMinRole("member", "admin")).toBe(false);
      expect(hasMinRole("member", "owner")).toBe(false);
    });

    // Viewer can only do viewer
    it("viewer meets only viewer", () => {
      expect(hasMinRole("viewer", "viewer")).toBe(true);
    });

    it("viewer cannot meet member, admin, or owner", () => {
      expect(hasMinRole("viewer", "member")).toBe(false);
      expect(hasMinRole("viewer", "admin")).toBe(false);
      expect(hasMinRole("viewer", "owner")).toBe(false);
    });

    // Unknown role
    it("unknown role gets level 0, fails all checks", () => {
      expect(hasMinRole("unknown", "viewer")).toBe(false);
      expect(hasMinRole("unknown", "member")).toBe(false);
      expect(hasMinRole("unknown", "admin")).toBe(false);
      expect(hasMinRole("unknown", "owner")).toBe(false);
    });

    it("empty string role fails all checks", () => {
      expect(hasMinRole("", "viewer")).toBe(false);
    });
  });
});

// ─── Procedure Access Matrix ────────────────────────────────────────

describe("tRPC procedure access matrix", () => {
  // Documents which procedures require which roles based on code review
  const procedureRoles: Record<string, { router: string; minRole: Role }> = {
    // Sites router
    "sites.list": { router: "sites", minRole: "viewer" },
    "sites.add": { router: "sites", minRole: "member" },
    "sites.update": { router: "sites", minRole: "member" },
    "sites.delete": { router: "sites", minRole: "admin" },
    // Scans router
    "scans.startScan": { router: "scans", minRole: "member" },
    "scans.listBySite": { router: "scans", minRole: "viewer" },
    "scans.getProgress": { router: "scans", minRole: "viewer" },
    // Violations router
    "violations.listByScan": { router: "violations", minRole: "viewer" },
    "violations.listByPage": { router: "violations", minRole: "viewer" },
    "violations.updateStatus": { router: "violations", minRole: "member" },
    // Members router
    "members.list": { router: "members", minRole: "viewer" },
    "members.invite": { router: "members", minRole: "admin" },
    "members.removeMember": { router: "members", minRole: "admin" },
    "members.changeRole": { router: "members", minRole: "admin" },
    // Organization router
    "organization.getOrg": { router: "organization", minRole: "viewer" },
    "organization.updateSettings": { router: "organization", minRole: "admin" },
    "organization.completeOnboarding": { router: "organization", minRole: "owner" },
    "organization.linkDodoCustomer": { router: "organization", minRole: "owner" },
    // Reports router
    "reports.listBySite": { router: "reports", minRole: "viewer" },
    "reports.createShareLink": { router: "reports", minRole: "member" },
    "reports.revokeShareLink": { router: "reports", minRole: "member" },
    "reports.generateVpat": { router: "reports", minRole: "member" },
    "reports.getVpatEntries": { router: "reports", minRole: "viewer" },
    "reports.updateVpatEntry": { router: "reports", minRole: "member" },
    "reports.updateVpatMetadata": { router: "reports", minRole: "member" },
    "reports.resetVpat": { router: "reports", minRole: "member" },
    // Dashboard router
    "dashboard.stats": { router: "dashboard", minRole: "viewer" },
  };

  it("viewer can access all read-only endpoints", () => {
    const viewerEndpoints = Object.entries(procedureRoles)
      .filter(([, config]) => config.minRole === "viewer")
      .map(([name]) => name);

    expect(viewerEndpoints).toContain("sites.list");
    expect(viewerEndpoints).toContain("scans.listBySite");
    expect(viewerEndpoints).toContain("violations.listByScan");
    expect(viewerEndpoints).toContain("dashboard.stats");
    expect(viewerEndpoints).toContain("reports.listBySite");
    expect(viewerEndpoints).toContain("reports.getVpatEntries");
  });

  it("write operations require at least member role", () => {
    const writeEndpoints = [
      "sites.add",
      "sites.update",
      "scans.startScan",
      "violations.updateStatus",
      "reports.createShareLink",
      "reports.revokeShareLink",
      "reports.generateVpat",
      "reports.updateVpatEntry",
      "reports.updateVpatMetadata",
      "reports.resetVpat",
    ];

    for (const endpoint of writeEndpoints) {
      const config = procedureRoles[endpoint];
      expect(config).toBeDefined();
      expect(hasMinRole(config!.minRole, "member")).toBe(true);
    }
  });

  it("destructive operations require admin role", () => {
    const adminEndpoints = [
      "sites.delete",
      "members.invite",
      "members.removeMember",
      "members.changeRole",
      "organization.updateSettings",
    ];

    for (const endpoint of adminEndpoints) {
      const config = procedureRoles[endpoint];
      expect(config).toBeDefined();
      expect(config!.minRole).toBe("admin");
    }
  });

  it("owner-only operations are restricted", () => {
    const ownerEndpoints = [
      "organization.completeOnboarding",
      "organization.linkDodoCustomer",
    ];

    for (const endpoint of ownerEndpoints) {
      const config = procedureRoles[endpoint];
      expect(config).toBeDefined();
      expect(config!.minRole).toBe("owner");
    }
  });

  it("total procedure count matches expected", () => {
    expect(Object.keys(procedureRoles)).toHaveLength(27);
  });
});

// ─── Paid Procedure Logic ───────────────────────────────────────────

describe("paid procedure gate logic", () => {
  // Mirrors the logic from paidProcedure in middleware.ts
  function shouldAllowAccess(
    plan: string,
    trialEndsAt: Date | null
  ): { allowed: boolean; reason?: string } {
    const paidPlans = ["starter", "agency", "pro"];

    if (paidPlans.includes(plan)) {
      return { allowed: true };
    }

    // Trial plan check
    if (trialEndsAt && new Date() <= trialEndsAt) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Your trial has expired. Please upgrade to continue.",
    };
  }

  it("allows access for all paid plans", () => {
    for (const plan of ["starter", "agency", "pro"]) {
      const result = shouldAllowAccess(plan, null);
      expect(result.allowed).toBe(true);
    }
  });

  it("allows access for active trial", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = shouldAllowAccess("trial", tomorrow);
    expect(result.allowed).toBe(true);
  });

  it("blocks access for expired trial", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = shouldAllowAccess("trial", yesterday);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("trial has expired");
  });

  it("blocks access when no trialEndsAt (null)", () => {
    const result = shouldAllowAccess("trial", null);
    expect(result.allowed).toBe(false);
  });

  it("paid plan access is independent of trialEndsAt", () => {
    const pastDate = new Date("2020-01-01");
    const result = shouldAllowAccess("agency", pastDate);
    expect(result.allowed).toBe(true);
  });
});
