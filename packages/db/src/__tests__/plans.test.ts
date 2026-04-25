import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_KEYS,
  getPlan,
  isTrialExpired,
  isPaidPlan,
  canGenerateVpat,
  canUseBadge,
  canShareLinks,
  isBrandedReport,
  canUseWhiteLabel,
  type PlanKey,
  type PlanConfig,
} from "../plans";

// ─── PLANS Data Integrity ───────────────────────────────────────────

describe("PLANS data structure", () => {
  it("contains exactly 4 plans: trial, starter, agency, pro", () => {
    expect(Object.keys(PLANS)).toHaveLength(4);
    expect(Object.keys(PLANS).sort()).toEqual(
      ["agency", "pro", "starter", "trial"]
    );
  });

  it("PLAN_KEYS matches PLANS keys", () => {
    expect([...PLAN_KEYS].sort()).toEqual(Object.keys(PLANS).sort());
  });

  it.each(PLAN_KEYS)("%s plan has all required fields", (key) => {
    const plan = PLANS[key];
    expect(plan.key).toBe(key);
    expect(typeof plan.name).toBe("string");
    expect(plan.name.length).toBeGreaterThan(0);
    expect(typeof plan.price).toBe("number");
    expect(plan.price).toBeGreaterThanOrEqual(0);
    expect(typeof plan.siteQuota).toBe("number");
    expect(typeof plan.pagesPerSite).toBe("number");
    expect(plan.pagesPerSite).toBeGreaterThan(0);
    expect(["weekly", "daily", "hourly"]).toContain(plan.scanFrequency);
    expect(typeof plan.teamMembers).toBe("number");
    expect(plan.teamMembers).toBeGreaterThan(0);
  });

  it.each(PLAN_KEYS)("%s plan has valid features object", (key) => {
    const { features } = PLANS[key];
    expect(typeof features.aiFixSuggestions).toBe("boolean");
    expect(["basic", "branded", "branded_vpat"]).toContain(features.pdfReports);
    expect(typeof features.clientDashboard).toBe("boolean");
    expect(typeof features.complianceBadge).toBe("boolean");
    expect(typeof features.shareLinks).toBe("boolean");
    expect(typeof features.apiAccess).toBe("boolean");
    expect(typeof features.whiteLabel).toBe("boolean");
  });
});

// ─── Pricing Tiers ──────────────────────────────────────────────────

describe("pricing tiers", () => {
  it("trial is free", () => {
    expect(PLANS.trial.price).toBe(0);
  });

  it("prices increase from starter → agency → pro", () => {
    expect(PLANS.starter.price).toBeLessThan(PLANS.agency.price);
    expect(PLANS.agency.price).toBeLessThan(PLANS.pro.price);
  });

  it("starter costs $49/mo (4900 cents)", () => {
    expect(PLANS.starter.price).toBe(4900);
  });

  it("agency costs $199/mo (19900 cents)", () => {
    expect(PLANS.agency.price).toBe(19900);
  });

  it("pro costs $499/mo (49900 cents)", () => {
    expect(PLANS.pro.price).toBe(49900);
  });
});

// ─── Site Quotas ────────────────────────────────────────────────────

describe("site quotas", () => {
  it("trial allows 25 sites", () => {
    expect(PLANS.trial.siteQuota).toBe(25);
  });

  it("starter allows 3 sites", () => {
    expect(PLANS.starter.siteQuota).toBe(3);
  });

  it("agency allows 25 sites", () => {
    expect(PLANS.agency.siteQuota).toBe(25);
  });

  it("pro has unlimited sites (-1)", () => {
    expect(PLANS.pro.siteQuota).toBe(-1);
  });
});

// ─── Feature Gating ─────────────────────────────────────────────────

describe("feature gating by plan tier", () => {
  it("all plans have AI fix suggestions", () => {
    for (const key of PLAN_KEYS) {
      expect(PLANS[key].features.aiFixSuggestions).toBe(true);
    }
  });

  it("only pro has VPAT (branded_vpat)", () => {
    expect(PLANS.trial.features.pdfReports).toBe("branded");
    expect(PLANS.starter.features.pdfReports).toBe("basic");
    expect(PLANS.agency.features.pdfReports).toBe("branded");
    expect(PLANS.pro.features.pdfReports).toBe("branded_vpat");
  });

  it("white-label only for agency and pro", () => {
    expect(PLANS.trial.features.whiteLabel).toBe(false);
    expect(PLANS.starter.features.whiteLabel).toBe(false);
    expect(PLANS.agency.features.whiteLabel).toBe(true);
    expect(PLANS.pro.features.whiteLabel).toBe(true);
  });

  it("API access only for pro", () => {
    expect(PLANS.trial.features.apiAccess).toBe(false);
    expect(PLANS.starter.features.apiAccess).toBe(false);
    expect(PLANS.agency.features.apiAccess).toBe(false);
    expect(PLANS.pro.features.apiAccess).toBe(true);
  });

  it("share links available for trial, agency, pro but not starter", () => {
    expect(PLANS.trial.features.shareLinks).toBe(true);
    expect(PLANS.starter.features.shareLinks).toBe(false);
    expect(PLANS.agency.features.shareLinks).toBe(true);
    expect(PLANS.pro.features.shareLinks).toBe(true);
  });

  it("compliance badge available for trial, agency, pro but not starter", () => {
    expect(PLANS.trial.features.complianceBadge).toBe(true);
    expect(PLANS.starter.features.complianceBadge).toBe(false);
    expect(PLANS.agency.features.complianceBadge).toBe(true);
    expect(PLANS.pro.features.complianceBadge).toBe(true);
  });
});

// ─── Dodo Payment Slugs ─────────────────────────────────────────────

describe("Dodo payment slugs", () => {
  it("trial has empty dodoSlug (free plan)", () => {
    expect(PLANS.trial.dodoSlug).toBe("");
  });

  it("paid plans have non-empty dodoSlug", () => {
    expect(PLANS.starter.dodoSlug).toBe("starter");
    expect(PLANS.agency.dodoSlug).toBe("agency");
    expect(PLANS.pro.dodoSlug).toBe("pro");
  });
});

// ─── getPlan() ──────────────────────────────────────────────────────

describe("getPlan", () => {
  it("returns correct plan for each valid key", () => {
    for (const key of PLAN_KEYS) {
      const plan = getPlan(key);
      expect(plan.key).toBe(key);
      expect(plan).toBe(PLANS[key]);
    }
  });

  it("returns trial for unknown plan key", () => {
    expect(getPlan("unknown")).toBe(PLANS.trial);
    expect(getPlan("")).toBe(PLANS.trial);
    expect(getPlan("premium")).toBe(PLANS.trial);
  });

  it("is case-sensitive (uppercase returns trial)", () => {
    expect(getPlan("STARTER")).toBe(PLANS.trial);
    expect(getPlan("Pro")).toBe(PLANS.trial);
  });
});

// ─── isTrialExpired() ───────────────────────────────────────────────

describe("isTrialExpired", () => {
  it("returns true when trialEndsAt is null", () => {
    expect(isTrialExpired(null)).toBe(true);
  });

  it("returns true when trial end date is in the past", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isTrialExpired(yesterday)).toBe(true);
  });

  it("returns false when trial end date is in the future", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isTrialExpired(tomorrow)).toBe(false);
  });

  it("returns false when trial end date is exactly now (strict greater-than)", () => {
    // The function uses `new Date() > trialEndsAt`, so equal means NOT expired
    // Use a date 1ms in the past to reliably test boundary
    const almostNow = new Date(Date.now() - 1);
    expect(isTrialExpired(almostNow)).toBe(true);

    // A date 1 second in the future should not be expired
    const justAhead = new Date(Date.now() + 1000);
    expect(isTrialExpired(justAhead)).toBe(false);
  });

  it("handles far future date", () => {
    const farFuture = new Date("2099-12-31");
    expect(isTrialExpired(farFuture)).toBe(false);
  });

  it("handles far past date", () => {
    const farPast = new Date("2000-01-01");
    expect(isTrialExpired(farPast)).toBe(true);
  });
});

// ─── isPaidPlan() ───────────────────────────────────────────────────

describe("isPaidPlan", () => {
  it("returns false for trial", () => {
    expect(isPaidPlan("trial")).toBe(false);
  });

  it("returns true for starter", () => {
    expect(isPaidPlan("starter")).toBe(true);
  });

  it("returns true for agency", () => {
    expect(isPaidPlan("agency")).toBe(true);
  });

  it("returns true for pro", () => {
    expect(isPaidPlan("pro")).toBe(true);
  });

  it("returns false for unknown plan", () => {
    expect(isPaidPlan("unknown")).toBe(false);
    expect(isPaidPlan("")).toBe(false);
  });
});

// ─── canGenerateVpat() ──────────────────────────────────────────────

describe("canGenerateVpat", () => {
  it("returns true only for pro plan", () => {
    expect(canGenerateVpat("pro")).toBe(true);
  });

  it("returns false for all other plans", () => {
    expect(canGenerateVpat("trial")).toBe(false);
    expect(canGenerateVpat("starter")).toBe(false);
    expect(canGenerateVpat("agency")).toBe(false);
  });

  it("returns false for unknown plan (falls back to trial)", () => {
    expect(canGenerateVpat("unknown")).toBe(false);
  });
});

// ─── canUseBadge() ──────────────────────────────────────────────────

describe("canUseBadge", () => {
  it("returns true for trial, agency, pro", () => {
    expect(canUseBadge("trial")).toBe(true);
    expect(canUseBadge("agency")).toBe(true);
    expect(canUseBadge("pro")).toBe(true);
  });

  it("returns false for starter", () => {
    expect(canUseBadge("starter")).toBe(false);
  });

  it("returns true for unknown (falls back to trial which has badge)", () => {
    expect(canUseBadge("unknown")).toBe(true);
  });
});

// ─── canShareLinks() ────────────────────────────────────────────────

describe("canShareLinks", () => {
  it("returns true for trial, agency, pro", () => {
    expect(canShareLinks("trial")).toBe(true);
    expect(canShareLinks("agency")).toBe(true);
    expect(canShareLinks("pro")).toBe(true);
  });

  it("returns false for starter", () => {
    expect(canShareLinks("starter")).toBe(false);
  });
});

// ─── isBrandedReport() ──────────────────────────────────────────────

describe("isBrandedReport", () => {
  it("returns true for trial (branded)", () => {
    expect(isBrandedReport("trial")).toBe(true);
  });

  it("returns false for starter (basic)", () => {
    expect(isBrandedReport("starter")).toBe(false);
  });

  it("returns true for agency (branded)", () => {
    expect(isBrandedReport("agency")).toBe(true);
  });

  it("returns true for pro (branded_vpat includes branded)", () => {
    expect(isBrandedReport("pro")).toBe(true);
  });
});

// ─── canUseWhiteLabel() ─────────────────────────────────────────────

describe("canUseWhiteLabel", () => {
  it("returns false for trial and starter", () => {
    expect(canUseWhiteLabel("trial")).toBe(false);
    expect(canUseWhiteLabel("starter")).toBe(false);
  });

  it("returns true for agency and pro", () => {
    expect(canUseWhiteLabel("agency")).toBe(true);
    expect(canUseWhiteLabel("pro")).toBe(true);
  });

  it("returns false for unknown plan", () => {
    expect(canUseWhiteLabel("unknown")).toBe(false);
  });
});

// ─── Scan Frequency Tiers ───────────────────────────────────────────

describe("scan frequency tiers", () => {
  it("starter gets weekly scans", () => {
    expect(PLANS.starter.scanFrequency).toBe("weekly");
  });

  it("trial and agency get daily scans", () => {
    expect(PLANS.trial.scanFrequency).toBe("daily");
    expect(PLANS.agency.scanFrequency).toBe("daily");
  });

  it("pro gets hourly scans", () => {
    expect(PLANS.pro.scanFrequency).toBe("hourly");
  });
});

// ─── Team Member Limits ─────────────────────────────────────────────

describe("team member limits", () => {
  it("starter allows 1 team member", () => {
    expect(PLANS.starter.teamMembers).toBe(1);
  });

  it("trial and agency allow 5 team members", () => {
    expect(PLANS.trial.teamMembers).toBe(5);
    expect(PLANS.agency.teamMembers).toBe(5);
  });

  it("pro allows 15 team members", () => {
    expect(PLANS.pro.teamMembers).toBe(15);
  });
});
