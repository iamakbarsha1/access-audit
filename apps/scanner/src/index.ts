import { config } from "./config.js";
import { startServer } from "./server.js";
import { createWorker } from "./worker.js";
import { closeBrowser } from "./browser.js";
import { redis, redisPub } from "./redis.js";

async function main(): Promise<void> {
  console.log("[scanner] Starting scanner service...");

  // Start health check server
  await startServer();

  // Start BullMQ worker
  const worker = createWorker();
  console.log("[scanner] Worker listening on 'scan' queue");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[scanner] Shutting down...");
    await worker.close();
    await closeBrowser();
    await redis.quit();
    await redisPub.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[scanner] Fatal error:", err);
  process.exit(1);
});
