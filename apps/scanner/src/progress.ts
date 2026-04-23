import { redisPub } from "./redis.js";
import type { ProgressEvent } from "./types.js";

export async function publishProgress(
  scanId: string,
  event: ProgressEvent
): Promise<void> {
  const channel = `scan:${scanId}:progress`;
  await redisPub.publish(channel, JSON.stringify(event));
}
