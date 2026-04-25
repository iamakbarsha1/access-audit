import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "AccessAudit — ADA Accessibility Compliance for Agencies",
    template: "%s | AccessAudit",
  },
  description:
    "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients. Start free.",
  keywords: [
    "ADA compliance",
    "WCAG",
    "accessibility audit",
    "web accessibility",
    "agency tools",
    "compliance reports",
    "axe-core",
    "WCAG 2.1",
  ],
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://accessaudit.com"
  ),
  openGraph: {
    type: "website",
    siteName: "AccessAudit",
    title: "AccessAudit — ADA Accessibility Compliance for Agencies",
    description:
      "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessAudit — ADA Accessibility Compliance for Agencies",
    description:
      "Scan websites for WCAG violations, get AI-powered fix suggestions, and deliver branded compliance reports to your clients.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
