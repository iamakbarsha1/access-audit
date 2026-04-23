export async function handleDodoWebhook(
  eventType: string,
  payload: unknown
): Promise<void> {
  console.log(`[Dodo Webhook] ${eventType}`, payload);
}
