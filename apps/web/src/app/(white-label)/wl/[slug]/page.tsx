import { notFound } from "next/navigation";
import { db } from "@access-audit/db/client";
import { organization } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";

interface WlLandingProps {
  params: Promise<{ slug: string }>;
}

export default async function WhiteLabelLandingPage({
  params,
}: WlLandingProps) {
  const { slug } = await params;

  const org = await db
    .select({
      name: organization.name,
      logo: organization.logo,
    })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0]) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-24 text-center">
      {org[0].logo ? (
        <img
          src={org[0].logo}
          alt={org[0].name}
          className="mb-8 h-20 w-auto object-contain"
        />
      ) : (
        <h1 className="mb-8 text-4xl font-bold text-gray-900">
          {org[0].name}
        </h1>
      )}

      {org[0].logo && (
        <h1 className="mb-4 text-3xl font-bold text-gray-900">
          {org[0].name}
        </h1>
      )}

      <p className="text-lg text-gray-500">Accessibility Compliance Reports</p>

      <p className="mt-8 text-sm text-gray-400">
        If you have received a report link, please use the full URL provided to
        you to access your compliance report.
      </p>
    </main>
  );
}
