import { NextRequest, NextResponse } from "next/server";
import { db } from "@access-audit/db/client";
import { organization, organizationSettings } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import { canUseWhiteLabel } from "@access-audit/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const org = await db
    .select({
      id: organization.id,
      name: organization.name,
      logo: organization.logo,
    })
    .from(organization)
    .where(eq(organization.slug, slug));

  if (!org[0]) {
    return NextResponse.json({ valid: false });
  }

  const settings = await db
    .select({ plan: organizationSettings.plan, brandColor: organizationSettings.brandColor })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, org[0].id));

  const plan = settings[0]?.plan ?? "trial";

  if (!canUseWhiteLabel(plan)) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true });
}
