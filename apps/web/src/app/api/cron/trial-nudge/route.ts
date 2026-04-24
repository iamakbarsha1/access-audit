import { NextResponse } from "next/server";
import { db, eq, and, sql } from "@access-audit/db";
import { organizationSettings } from "@access-audit/db/schema";
import { member, user } from "@access-audit/db/schema";
import { sendTrialExpiringEmail } from "@/lib/billing/emails";

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  // Find orgs on trial expiring in 1-2 days
  const expiringOrgs = await db
    .select({
      organizationId: organizationSettings.organizationId,
      trialEndsAt: organizationSettings.trialEndsAt,
    })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.plan, "trial"),
        sql`${organizationSettings.trialEndsAt} > ${oneDayFromNow}`,
        sql`${organizationSettings.trialEndsAt} <= ${twoDaysFromNow}`
      )
    );

  let sent = 0;
  for (const org of expiringOrgs) {
    // Find owner email
    const ownerResult = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.organizationId, org.organizationId),
          eq(member.role, "owner")
        )
      );

    const ownerEmail = ownerResult[0]?.email;
    if (!ownerEmail) continue;

    const daysLeft = Math.ceil(
      (org.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    await sendTrialExpiringEmail(ownerEmail, daysLeft);
    sent++;
  }

  return NextResponse.json({ sent, checked: expiringOrgs.length });
}
