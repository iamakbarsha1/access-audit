"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { PLANS, type PlanKey } from "@access-audit/db/plans";
import { toast } from "sonner";
import { useState } from "react";

const DISPLAY_PLANS: PlanKey[] = ["starter", "agency", "pro"];

const FEATURE_ROWS = [
  { label: "AI fix suggestions", key: "aiFixSuggestions" },
  { label: "Client dashboard", key: "clientDashboard" },
  { label: "Compliance badge", key: "complianceBadge" },
  { label: "API access", key: "apiAccess" },
  { label: "White-label", key: "whiteLabel" },
] as const;

interface PricingCardsProps {
  showHeader?: boolean;
}

export function PricingCards({ showHeader = true }: PricingCardsProps) {
  const { data: session } = useSession();
  const orgQuery = trpc.organization.getOrg.useQuery(undefined, {
    enabled: !!session,
  });
  const currentPlan = orgQuery.data?.settings?.plan ?? "trial";
  const [loading, setLoading] = useState<string | null>(null);

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const isUpgrade = searchParams.get("upgrade") === "true";

  async function handleSelectPlan(slug: string) {
    if (!session) {
      window.location.href = "/signup";
      return;
    }

    setLoading(slug);
    try {
      const res = await fetch("/api/auth/dodopayments/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();

      if (!res.ok || !data?.url) {
        toast.error("Failed to start checkout. Please try again.");
        return;
      }

      window.location.href = data.url;
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      {showHeader && (
        <div className="text-center">
          <h1 className="text-3xl font-bold">
            {isUpgrade ? "Choose Your Plan" : "Simple, Transparent Pricing"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isUpgrade
              ? "Select the plan that fits your needs."
              : "Start with a 7-day free trial. No credit card required."}
          </p>
        </div>
      )}

      <div className={`grid gap-6 md:grid-cols-3 ${showHeader ? "mt-12" : ""}`}>
        {DISPLAY_PLANS.map((key) => {
          const plan = PLANS[key];
          const isCurrent = currentPlan === key;
          const isPopular = key === "agency";

          return (
            <Card
              key={key}
              className={`relative ${
                isPopular ? "border-2 border-primary shadow-lg" : ""
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold">
                    ${(plan.price / 100).toFixed(0)}
                  </span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.siteQuota === -1
                      ? "Unlimited sites"
                      : `Up to ${plan.siteQuota} sites`}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.pagesPerSite} pages per site
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.scanFrequency.charAt(0).toUpperCase() +
                      plan.scanFrequency.slice(1)}{" "}
                    scans
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.teamMembers} team member
                    {plan.teamMembers > 1 ? "s" : ""}
                  </li>
                  {FEATURE_ROWS.map((feat) => (
                    <li key={feat.key} className="flex items-center gap-2">
                      {plan.features[feat.key] ? (
                        <Check className="h-4 w-4 text-primary" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40" />
                      )}
                      <span
                        className={
                          !plan.features[feat.key]
                            ? "text-muted-foreground/60"
                            : ""
                        }
                      >
                        {feat.label}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    {plan.features.pdfReports === "basic"
                      ? "Basic PDF reports"
                      : plan.features.pdfReports === "branded"
                        ? "Branded PDF reports"
                        : "Branded + VPAT reports"}
                  </li>
                </ul>

                {isCurrent ? (
                  <Button className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : session ? (
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    onClick={() => handleSelectPlan(plan.dodoSlug)}
                    disabled={loading === plan.dodoSlug}
                  >
                    {loading === plan.dodoSlug
                      ? "Redirecting..."
                      : `${isUpgrade ? "Switch to" : "Get"} ${plan.name}`}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isPopular ? "default" : "outline"}
                    asChild
                  >
                    <a href="/signup">Start Free Trial</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
