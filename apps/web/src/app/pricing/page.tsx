"use client";

import { PricingCards } from "@/components/marketing/pricing-cards";

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <PricingCards showHeader={true} />
    </div>
  );
}
