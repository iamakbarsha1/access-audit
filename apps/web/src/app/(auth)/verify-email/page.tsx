"use client";

import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const sessionEmail = session?.user?.email;
    const storedEmail = localStorage.getItem("pendingEmail");
    setEmail(sessionEmail || storedEmail || "");
  }, [session]);

  useEffect(() => {
    if (session?.user?.emailVerified) {
      localStorage.removeItem("pendingEmail");
      router.push("/onboarding");
    }
  }, [session, router]);

  async function handleResend() {
    if (!email) {
      toast.error("No email address found. Please sign up again.");
      return;
    }
    const { error } = await authClient.sendVerificationEmail({
      email,
    });
    if (error) {
      toast.error("Failed to resend verification email");
      return;
    }
    toast.success("Verification email sent!");
  }

  return (
    <Card className="text-center">
      <CardHeader>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to{" "}
          <strong>{email || "your email"}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Click the link in the email to verify your account and get started.
        </p>
        <Button variant="outline" onClick={handleResend}>
          Resend verification email
        </Button>
      </CardContent>
    </Card>
  );
}
