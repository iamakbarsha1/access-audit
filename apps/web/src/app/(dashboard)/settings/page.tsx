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
import { BillingTab } from "@/components/billing/billing-tab";
import { canUseWhiteLabel } from "@access-audit/db";

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

          <Card>
            <CardHeader>
              <CardTitle>White-Label Subdomain</CardTitle>
              <CardDescription>
                Serve branded client reports under your own subdomain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {orgQuery.data?.settings?.plan &&
              canUseWhiteLabel(orgQuery.data.settings.plan) ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Your subdomain:
                    </span>
                    <code className="rounded bg-muted px-2 py-1 text-sm font-medium">
                      {orgQuery.data?.organization?.slug}.accessaudit.com
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `https://${orgQuery.data?.organization?.slug}.accessaudit.com`
                        );
                        toast.success("Subdomain URL copied!");
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share links created for your sites will automatically use
                    this subdomain. Your clients will see your branding instead
                    of AccessAudit.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Upgrade to Agency or Pro to serve branded reports under your
                    own subdomain.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/pricing">View Plans</a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="pt-4">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
