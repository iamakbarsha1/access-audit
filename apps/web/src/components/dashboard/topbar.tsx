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
