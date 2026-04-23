"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StepBranding } from "@/components/onboarding/step-branding";
import { StepAddSite } from "@/components/onboarding/step-add-site";
import { StepReady } from "@/components/onboarding/step-ready";
import { cn } from "@/lib/utils";

const steps = ["Branding", "Add Site", "Ready"];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="mx-auto max-w-xl py-8">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                i <= currentStep
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                "text-sm",
                i <= currentStep
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className="mx-2 h-px w-8 bg-border" />
            )}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {currentStep === 0 && (
            <StepBranding onNext={() => setCurrentStep(1)} />
          )}
          {currentStep === 1 && (
            <StepAddSite onNext={() => setCurrentStep(2)} />
          )}
          {currentStep === 2 && <StepReady />}
        </CardContent>
      </Card>
    </div>
  );
}
