import {
  Sparkles,
  Shield,
  FileText,
  Globe,
  BadgeCheck,
  Users,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { PricingCards } from "@/components/marketing/pricing-cards";
import { FaqAccordion } from "@/components/marketing/faq-accordion";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Fix Suggestions",
    description:
      "Get copy-paste code fixes for every violation, powered by Claude AI. Stop guessing — get actionable fixes instantly.",
  },
  {
    icon: Shield,
    title: "WCAG 2.1 AA Scanning",
    description:
      "Industry-standard axe-core engine scans up to 200 pages per site. The same engine trusted by Google and Microsoft.",
  },
  {
    icon: FileText,
    title: "Branded PDF Reports",
    description:
      "Deliver professional compliance reports with your agency's logo and colors. Impress clients with polished deliverables.",
  },
  {
    icon: Globe,
    title: "White-Label Dashboard",
    description:
      "Give clients their own branded portal at your-agency.accessaudit.com. Your brand, your clients, zero AccessAudit branding.",
  },
  {
    icon: BadgeCheck,
    title: "Compliance Badges",
    description:
      "Embed dynamic SVG badges that prove your clients' sites are compliant. Builds trust and demonstrates value.",
  },
  {
    icon: Users,
    title: "Team Management",
    description:
      "Invite your team with role-based access: owner, admin, member, viewer. Collaborate seamlessly across your agency.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Add Your Site",
    description:
      "Enter a URL and we automatically crawl and discover pages. Set scan frequency — hourly, daily, or weekly.",
  },
  {
    number: "02",
    title: "We Scan & Analyze",
    description:
      "axe-core checks every page for WCAG violations. Claude AI generates fix code and plain-English explanations for each issue.",
  },
  {
    number: "03",
    title: "Deliver to Clients",
    description:
      "PDF reports, branded dashboards, compliance badges — all ready to share. White-label everything under your agency brand.",
  },
];

const STATS = [
  {
    value: "95.9%",
    label: "of websites are non-compliant",
    source: "WebAIM Million 2025",
  },
  {
    value: "37%",
    label: "surge in ADA lawsuits in H1 2025",
    source: "UsableNet Report",
  },
  {
    value: "Apr 2026",
    label: "ADA Title II compliance deadline",
    source: "Department of Justice",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "AccessAudit",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports.",
            offers: [
              {
                "@type": "Offer",
                name: "Starter",
                price: "49",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
              },
              {
                "@type": "Offer",
                name: "Agency",
                price: "199",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
              },
              {
                "@type": "Offer",
                name: "Pro",
                price: "499",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
              },
            ],
          }),
        }}
      />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/50 to-purple-50/50" />
        <div className="absolute top-0 right-0 -z-0 h-[500px] w-[500px] rounded-full bg-purple-100/40 blur-3xl" />
        <div className="absolute bottom-0 left-0 -z-0 h-[400px] w-[400px] rounded-full bg-blue-100/40 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-medium text-purple-700">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Accessibility Compliance
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Your clients&apos; websites.
              <br />
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                Fully compliant.
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Scan websites for WCAG violations, get AI-powered fix suggestions,
              and deliver branded compliance reports — all under your agency
              brand.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-xl hover:shadow-purple-500/30 hover:opacity-95"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-8 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                See How It Works
              </a>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              7-day free trial &middot; No credit card required
            </p>
          </div>

          {/* Dashboard preview mockup */}
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-xl border bg-white/80 p-2 shadow-2xl shadow-purple-500/10 backdrop-blur">
              <div className="rounded-lg border bg-gradient-to-br from-slate-50 to-white p-6">
                {/* Mock dashboard header */}
                <div className="flex items-center justify-between border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600" />
                    <div>
                      <div className="h-3 w-32 rounded bg-slate-200" />
                      <div className="mt-1.5 h-2 w-20 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="rounded-md bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      92% Compliant
                    </div>
                  </div>
                </div>
                {/* Mock stat cards */}
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {[
                    { label: "Sites", value: "12" },
                    { label: "Avg. Score", value: "87%" },
                    { label: "Violations", value: "34" },
                    { label: "Fixed", value: "156" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border bg-white p-3 text-center"
                    >
                      <div className="text-lg font-bold text-foreground">
                        {stat.value}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mock violations list */}
                <div className="mt-4 space-y-2">
                  {[
                    { rule: "color-contrast", impact: "Serious", page: "/about" },
                    { rule: "image-alt", impact: "Critical", page: "/home" },
                    { rule: "link-name", impact: "Moderate", page: "/contact" },
                  ].map((v) => (
                    <div
                      key={v.rule + v.page}
                      className="flex items-center justify-between rounded-lg border bg-white px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground/30" />
                        <div>
                          <span className="text-sm font-medium">
                            {v.rule}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {v.page}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          v.impact === "Critical"
                            ? "bg-red-100 text-red-700"
                            : v.impact === "Serious"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {v.impact}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== URGENCY STATS BAR ===== */}
      <section className="border-y bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3">
          {STATS.map((stat) => (
            <div key={stat.value} className="text-center">
              <div className="text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent sm:text-4xl">
                {stat.value}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {stat.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stat.source}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES GRID ===== */}
      <section id="features" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything agencies need to{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                deliver compliance
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From scanning to reporting, AccessAudit handles the entire
              accessibility workflow.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border bg-white p-6 transition-all hover:border-purple-200 hover:shadow-lg hover:shadow-purple-500/5"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-600/10 text-purple-600">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section
        id="how-it-works"
        className="scroll-mt-20 border-y bg-gradient-to-br from-slate-50 to-purple-50/30"
      >
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps to{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                full compliance
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Get from zero to compliant in minutes, not months.
            </p>
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {STEPS.map((step, idx) => (
              <div key={step.number} className="relative">
                {/* Connector line (desktop only) */}
                {idx < STEPS.length - 1 && (
                  <div className="absolute top-12 left-full hidden h-0.5 w-8 bg-gradient-to-r from-purple-300 to-transparent lg:block" />
                )}
                <div className="rounded-xl border bg-white p-6 shadow-sm">
                  <div className="mb-4 text-3xl font-extrabold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                    {step.number}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="scroll-mt-20">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple,{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                transparent pricing
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start with a 7-day free trial. No credit card required.
            </p>
          </div>
          <div className="mt-12">
            <PricingCards showHeader={false} />
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section
        id="faq"
        className="scroll-mt-20 border-y bg-gradient-to-br from-slate-50 to-blue-50/30"
      >
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Frequently asked{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                questions
              </span>
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Everything you need to know about AccessAudit.
            </p>
          </div>
          <div className="mt-12">
            <FaqAccordion />
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />

        <div className="relative mx-auto max-w-4xl px-6 py-20 text-center sm:py-24">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to make your clients&apos; sites compliant?
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            Start your free 7-day trial. No credit card required.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-purple-700 shadow-lg transition-all hover:shadow-xl hover:bg-purple-50"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
