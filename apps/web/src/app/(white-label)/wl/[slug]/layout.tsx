import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import { organization, organizationSettings } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import type { Metadata } from "next";

interface WlLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const org = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.slug, slug));

  const orgName = org[0]?.name ?? "Accessibility Report";

  return {
    title: `${orgName} | Accessibility Report`,
  };
}

export default async function WhiteLabelLayout({
  children,
  params,
}: WlLayoutProps) {
  const { slug } = await params;

  // Fetch org branding
  const org = await db
    .select({
      id: organization.id,
      name: organization.name,
      logo: organization.logo,
    })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0]) {
    notFound();
  }

  const settings = await db
    .select({ brandColor: organizationSettings.brandColor })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, org[0].id));

  const brandColor = settings[0]?.brandColor ?? "#6366f1";
  const logoUrl = org[0].logo;
  const orgName = org[0].name;

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ "--wl-brand-color": brandColor } as React.CSSProperties}
    >
      {/* Branded Header */}
      <header
        className="border-b bg-white px-6 py-4"
        style={{ borderBottomColor: brandColor }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={orgName}
                className="h-8 w-auto object-contain"
              />
            ) : null}
            <span className="text-lg font-semibold text-gray-900">
              {orgName}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      {children}

      {/* Powered by Footer */}
      <footer className="border-t bg-white px-6 py-4 text-center text-xs text-gray-400">
        Powered by{" "}
        <a
          href="https://accessaudit.com"
          className="text-gray-500 underline hover:text-gray-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          AccessAudit
        </a>
      </footer>
    </div>
  );
}
