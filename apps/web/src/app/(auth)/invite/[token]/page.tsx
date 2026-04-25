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
    router.push("/dashboard");
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
            <Link href="/dashboard">Go to Dashboard</Link>
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
