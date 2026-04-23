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
