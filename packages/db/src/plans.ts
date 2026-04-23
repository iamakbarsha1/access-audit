export const PLAN_KEYS = ["trial", "starter", "agency", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanFeatures {
  aiFixSuggestions: boolean;
  pdfReports: "basic" | "branded" | "branded_vpat";
  clientDashboard: boolean;
  complianceBadge: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
}

export interface PlanConfig {
  key: PlanKey;
  name: string;
  price: number; // cents per month
  dodoSlug: string; // slug used in Better-Auth checkout config
  siteQuota: number; // -1 means unlimited
  pagesPerSite: number;
  scanFrequency: "weekly" | "daily" | "hourly";
  teamMembers: number;
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  trial: {
    key: "trial",
    name: "Trial",
    price: 0,
    dodoSlug: "",
    siteQuota: 25,
    pagesPerSite: 50,
    scanFrequency: "daily",
    teamMembers: 5,
    features: {
      aiFixSuggestions: true,
      pdfReports: "branded",
      clientDashboard: true,
      complianceBadge: true,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  starter: {
    key: "starter",
    name: "Starter",
    price: 4900,
    dodoSlug: "starter",
    siteQuota: 3,
    pagesPerSite: 25,
    scanFrequency: "weekly",
    teamMembers: 1,
    features: {
      aiFixSuggestions: true,
      pdfReports: "basic",
      clientDashboard: false,
      complianceBadge: false,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  agency: {
    key: "agency",
    name: "Agency",
    price: 19900,
    dodoSlug: "agency",
    siteQuota: 25,
    pagesPerSite: 50,
    scanFrequency: "daily",
    teamMembers: 5,
    features: {
      aiFixSuggestions: true,
      pdfReports: "branded",
      clientDashboard: true,
      complianceBadge: true,
      apiAccess: false,
      whiteLabel: false,
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    price: 49900,
    dodoSlug: "pro",
    siteQuota: -1,
    pagesPerSite: 200,
    scanFrequency: "hourly",
    teamMembers: 15,
    features: {
      aiFixSuggestions: true,
      pdfReports: "branded_vpat",
      clientDashboard: true,
      complianceBadge: true,
      apiAccess: true,
      whiteLabel: true,
    },
  },
};

export function getPlan(key: string): PlanConfig {
  if (key in PLANS) return PLANS[key as PlanKey];
  return PLANS.trial;
}

export function isTrialExpired(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return true;
  return new Date() > trialEndsAt;
}

export function isPaidPlan(key: string): boolean {
  return key === "starter" || key === "agency" || key === "pro";
}
