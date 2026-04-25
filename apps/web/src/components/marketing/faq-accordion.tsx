import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    q: "How accurate is the scanning?",
    a: "We use axe-core, the industry-standard accessibility testing engine used by Deque, Google, and Microsoft. It catches real WCAG violations with minimal false positives — the same engine that powers the Chrome DevTools accessibility audit.",
  },
  {
    q: "Does this make my site ADA compliant?",
    a: "AccessAudit identifies WCAG violations and provides AI-generated fix code for each issue. Full compliance requires implementing the fixes. We're a diagnostic and remediation tool, not a legal guarantee — but we give you everything you need to get compliant.",
  },
  {
    q: "What WCAG standards do you test?",
    a: "WCAG 2.1 Level AA — the standard referenced by ADA Title II and the most widely adopted benchmark for web accessibility. This covers contrast ratios, keyboard navigation, screen reader compatibility, form labels, and more.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — 7 days on the Agency plan with full access to all features, no credit card required. Scan sites, generate reports, invite your team, and see the value before you pay.",
  },
  {
    q: "How does white-label work?",
    a: "Agency and Pro plans get a branded subdomain (your-name.accessaudit.com) with your logo and brand colors. Share reports and compliance dashboards with your clients under your own brand — they never see AccessAudit.",
  },
  {
    q: "Is my data secure?",
    a: "All data is encrypted in transit (TLS) and at rest. We host on Vercel (SOC 2 compliant) with Neon PostgreSQL (SOC 2 compliant). We never store raw IP addresses, use no tracking cookies, and follow privacy-by-design principles.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing settings at any time — no contracts, no cancellation fees. Your data is preserved and you can reactivate whenever you want.",
  },
];

export function FaqAccordion() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {FAQ_ITEMS.map((item, i) => (
        <AccordionItem key={i} value={`faq-${i}`}>
          <AccordionTrigger className="text-left text-base font-medium">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground leading-relaxed">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
