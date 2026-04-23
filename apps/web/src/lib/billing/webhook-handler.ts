import { db } from "@access-audit/db/client";
import { organizationSettings, user, member } from "@access-audit/db/schema";
import { eq } from "@access-audit/db";
import { getPlan, type PlanKey } from "@access-audit/db";
import {
  sendSubscriptionActiveEmail,
  sendPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from "./emails";

async function findOrgByDodoCustomerId(
  customerId: string
): Promise<{ orgId: string; ownerEmail: string } | null> {
  const settings = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.dodoCustomerId, customerId));

  if (settings[0]) {
    const ownerEmail = await getOrgOwnerEmail(settings[0].organizationId);
    return { orgId: settings[0].organizationId, ownerEmail };
  }

  return null;
}

async function getOrgOwnerEmail(orgId: string): Promise<string> {
  const ownerMember = await db
    .select({ email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  const owner = ownerMember.find((m) => m.role === "owner");
  return owner?.email ?? ownerMember[0]?.email ?? "";
}

function resolveProductToPlan(productId: string): PlanKey {
  if (productId === process.env.DODO_PRODUCT_STARTER) return "starter";
  if (productId === process.env.DODO_PRODUCT_AGENCY) return "agency";
  if (productId === process.env.DODO_PRODUCT_PRO) return "pro";
  return "trial";
}

export async function handleDodoWebhook(
  eventType: string,
  payload: unknown
): Promise<void> {
  const data =
    (payload as Record<string, unknown>)?.data ?? (payload as Record<string, unknown>);
  const record = data as Record<string, unknown>;
  const customerId =
    (record?.customer_id as string) ?? (record?.customerId as string);
  const subscriptionId =
    (record?.subscription_id as string) ?? (record?.subscriptionId as string);
  const productId =
    (record?.product_id as string) ?? (record?.productId as string);

  if (!customerId) {
    console.error(`[Dodo Webhook] No customer_id in ${eventType}`, payload);
    return;
  }

  const org = await findOrgByDodoCustomerId(customerId);
  if (!org) {
    console.error(
      `[Dodo Webhook] No org found for customer ${customerId}`,
      eventType
    );
    return;
  }

  switch (eventType) {
    case "subscription.active": {
      const planKey = resolveProductToPlan(productId);
      const plan = getPlan(planKey);
      await db
        .update(organizationSettings)
        .set({
          plan: planKey,
          dodoSubscriptionId: subscriptionId,
          siteQuota: plan.siteQuota === -1 ? 999999 : plan.siteQuota,
          scanQuota: plan.pagesPerSite,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));

      await sendSubscriptionActiveEmail(org.ownerEmail, plan.name);
      break;
    }

    case "subscription.on_hold": {
      await db
        .update(organizationSettings)
        .set({
          plan: "trial",
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));

      const portalUrl = `${process.env.BETTER_AUTH_URL}/api/auth/dodopayments/portal?customer_id=${customerId}`;
      await sendPaymentFailedEmail(org.ownerEmail, portalUrl);
      break;
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      await db
        .update(organizationSettings)
        .set({
          plan: "trial",
          dodoSubscriptionId: null,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));

      await sendSubscriptionCancelledEmail(org.ownerEmail);
      break;
    }

    case "subscription.plan_changed": {
      const planKey = resolveProductToPlan(productId);
      const plan = getPlan(planKey);
      await db
        .update(organizationSettings)
        .set({
          plan: planKey,
          siteQuota: plan.siteQuota === -1 ? 999999 : plan.siteQuota,
          scanQuota: plan.pagesPerSite,
          updatedAt: new Date(),
        })
        .where(eq(organizationSettings.organizationId, org.orgId));
      break;
    }

    case "subscription.renewed": {
      console.log(`[Dodo Webhook] Subscription renewed for org ${org.orgId}`);
      break;
    }

    case "subscription.failed": {
      console.error(
        `[Dodo Webhook] Subscription creation failed for org ${org.orgId}`,
        data
      );
      break;
    }

    default:
      console.log(`[Dodo Webhook] Unhandled event: ${eventType}`);
  }
}
