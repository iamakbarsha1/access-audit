"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/trpc/client";
import { getPlan, isPaidPlan, isTrialExpired } from "@access-audit/db/plans";
import { ExternalLink } from "lucide-react";

export function BillingTab() {
  const orgQuery = trpc.organization.getOrg.useQuery();
  const settings = orgQuery.data?.settings;
  const planKey = settings?.plan ?? "trial";
  const plan = getPlan(planKey);
  const trialEndsAt = settings?.trialEndsAt
    ? new Date(settings.trialEndsAt)
    : null;
  const paid = isPaidPlan(planKey);
  const trialExpired = !paid && isTrialExpired(trialEndsAt);

  const daysLeft = trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  async function handleManageBilling() {
    const res = await fetch("/api/auth/dodopayments/customer/portal", {
      credentials: "include",
    });
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    }
  }

  return (
    <div className="space-y-4">
      {/* Plan Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Current Plan
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xl font-semibold">{plan.name}</span>
                {paid && (
                  <span className="text-sm text-muted-foreground">
                    ${(plan.price / 100).toFixed(0)}/mo
                  </span>
                )}
                {!paid && !trialExpired && (
                  <Badge variant="secondary">
                    Trial &middot; {daysLeft} day{daysLeft !== 1 ? "s" : ""}{" "}
                    left
                  </Badge>
                )}
                {trialExpired && (
                  <Badge variant="destructive">Trial expired</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <a href="/pricing?upgrade=true">Change Plan</a>
              </Button>
              {paid && (
                <Button variant="outline" onClick={handleManageBilling}>
                  Manage Billing
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Sites</p>
            <p className="mt-1 text-2xl font-semibold">
              {plan.siteQuota === -1 ? "Unlimited" : `— / ${plan.siteQuota}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Team Members</p>
            <p className="mt-1 text-2xl font-semibold">
              — / {plan.teamMembers}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">Pages per Site</p>
            <p className="mt-1 text-2xl font-semibold">
              {plan.pagesPerSite}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
